#!/usr/bin/env python3
"""Generate isolated verb audio with Kokoro Michael.

Approved production method (Sep 2026):
- American English only
- resolve each item as a VERB from an invisible grammatical context
- pass the resolved Misaki phonemes directly to Kokoro
- fixed speed 1.0: waveform heuristics never change pronunciation speed
- append 180 ms silence only to the WAV file
- three validated exceptions: accept, acknowledge, refuse
- visible site text is never modified by TTS-only controls
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from kokoro import KModel, KPipeline

SAMPLE_RATE = 24000
VOICE = "am_michael"
SPEED = 1.0
TAIL_SILENCE_MS = 180

VERB_CONTEXTS = (
    "to {verb}",
    "I need to {verb} this",
    "They want to {verb} it",
)

# These are TTS-only controls validated by listening tests. They never alter
# the verb displayed on the site.
EXCEPTIONS = {
    "accept": {"terminal_boundary": True},
    "acknowledge": {"terminal_boundary": True},
    "refuse": {
        "replace_once": ["ɹə", "ɹɪ"],
        "terminal_boundary": True,
    },
}


@dataclass
class QA:
    duration_s: float
    peak: float
    rms: float
    silence_ratio: float
    tail_rms_ratio: float
    flags: list[str]


@dataclass
class WordResult:
    verb: str
    context: str
    pos_tag: str
    base_phonemes: str
    tts_phonemes: str
    exception: dict | None
    output: str
    generation_hash: str
    qa: QA


def load_verbs(path: Path) -> list[str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload if isinstance(payload, list) else payload.get("verbs", [])
    verbs: list[str] = []
    for row in rows:
        verb = row if isinstance(row, str) else row.get("verb")
        if verb and str(verb).strip():
            verbs.append(str(verb).strip())
    if not verbs:
        raise RuntimeError(f"No verbs found in {path}")
    return verbs


def resolve_verb_phonemes(g2p, verb: str) -> tuple[str, str, str]:
    """Return (phonemes, POS tag, context), failing closed unless it is verbal."""
    target = verb.casefold()
    diagnostics = []
    for template in VERB_CONTEXTS:
        context = template.format(verb=verb)
        _, tokens = g2p(context)
        for token in tokens:
            if token.text.casefold() != target or not token.phonemes:
                continue
            diagnostics.append((context, token.tag, token.phonemes))
            if token.tag and token.tag.startswith("VB"):
                return token.phonemes, token.tag, context
    raise RuntimeError(
        f"Could not resolve {verb!r} as a verb. Candidates: {diagnostics!r}"
    )


def apply_tts_exception(verb: str, phonemes: str) -> tuple[str, dict | None]:
    rule = EXCEPTIONS.get(verb.casefold())
    if not rule:
        return phonemes, None

    controlled = phonemes
    if "replace_once" in rule:
        old, new = rule["replace_once"]
        if old not in controlled:
            raise RuntimeError(
                f"Expected phoneme fragment {old!r} not found for {verb}: {phonemes!r}"
            )
        controlled = controlled.replace(old, new, 1)
    if rule.get("terminal_boundary"):
        controlled += "."
    return controlled, rule


def synthesize(model: KModel, voice_pack, phonemes: str) -> np.ndarray:
    if not phonemes:
        raise ValueError("Empty phoneme sequence")
    if len(phonemes) > len(voice_pack):
        raise ValueError(f"Phoneme sequence too long for voice pack: {len(phonemes)}")
    ref_s = voice_pack[len(phonemes) - 1]
    with torch.inference_mode():
        audio = model(phonemes, ref_s, SPEED)
    return audio.detach().cpu().numpy().astype(np.float32).reshape(-1)


def inspect_audio(audio: np.ndarray) -> QA:
    audio = np.asarray(audio, dtype=np.float32).reshape(-1)
    if not audio.size:
        return QA(0, 0, 0, 1, 1, ["empty"])

    absolute = np.abs(audio)
    peak = float(absolute.max())
    rms = float(np.sqrt(np.mean(np.square(audio)) + 1e-12))
    duration = float(audio.size / SAMPLE_RATE)
    silence_ratio = float(np.mean(absolute < 0.0025))
    tail_n = min(audio.size, int(SAMPLE_RATE * 0.04))
    tail = audio[-tail_n:]
    tail_rms = float(np.sqrt(np.mean(np.square(tail)) + 1e-12))
    tail_ratio = float(tail_rms / max(rms, 1e-6))

    # Screening only. These metrics can flag obviously broken files but do not
    # claim to prove linguistic correctness and NEVER alter synthesis speed.
    flags: list[str] = []
    if duration < 0.15:
        flags.append("too_short")
    if duration > 2.5:
        flags.append("too_long")
    if peak < 0.02:
        flags.append("too_quiet")
    if peak > 1.01:
        flags.append("clipping")
    if silence_ratio > 0.75:
        flags.append("too_much_silence")
    if tail_ratio > 1.6:
        flags.append("hot_tail")

    return QA(
        duration_s=round(duration, 4),
        peak=round(peak, 5),
        rms=round(rms, 5),
        silence_ratio=round(silence_ratio, 4),
        tail_rms_ratio=round(tail_ratio, 4),
        flags=flags,
    )


def append_tail(audio: np.ndarray) -> np.ndarray:
    n = int(SAMPLE_RATE * TAIL_SILENCE_MS / 1000)
    return np.concatenate([audio, np.zeros(n, dtype=np.float32)])


def generation_hash(verb: str, tts_phonemes: str) -> str:
    payload = json.dumps(
        {
            "verb": verb,
            "phonemes": tts_phonemes,
            "voice": VOICE,
            "speed": SPEED,
            "tail_ms": TAIL_SILENCE_MS,
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:20]


def generate_one(
    verb: str,
    model: KModel,
    pipeline: KPipeline,
    voice_pack,
    output_dir: Path,
) -> WordResult:
    base, tag, context = resolve_verb_phonemes(pipeline.g2p, verb)
    controlled, exception = apply_tts_exception(verb, base)
    audio = synthesize(model, voice_pack, controlled)
    qa = inspect_audio(audio)
    output = output_dir / f"{verb}-word.wav"
    sf.write(output, append_tail(audio), SAMPLE_RATE, subtype="PCM_16")

    return WordResult(
        verb=verb,
        context=context,
        pos_tag=tag,
        base_phonemes=base,
        tts_phonemes=controlled,
        exception=exception,
        output=str(output),
        generation_hash=generation_hash(verb, controlled),
        qa=qa,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/verbs.json")
    parser.add_argument("--out", default="audio/word-v2")
    parser.add_argument("--report", default="audio/word-v2/qa-report.json")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    output_dir = Path(args.out)
    report_path = Path(args.report)
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    verbs = load_verbs(Path(args.data))
    if args.limit:
        verbs = verbs[: args.limit]

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")
    print(f"Voice: {VOICE} | speed={SPEED}")

    model = KModel().to(device).eval()
    pipeline = KPipeline(lang_code="a", model=False)
    voice_pack = pipeline.load_voice(VOICE).to(device)

    results: list[WordResult] = []
    failures: list[dict] = []

    for i, verb in enumerate(verbs, 1):
        output = output_dir / f"{verb}-word.wav"
        if output.exists() and args.resume:
            print(f"[{i}/{len(verbs)}] skip {verb}")
            continue
        if output.exists() and not args.overwrite:
            failures.append({"verb": verb, "error": "output_exists"})
            print(f"[{i}/{len(verbs)}] EXISTS {verb}")
            continue

        try:
            result = generate_one(verb, model, pipeline, voice_pack, output_dir)
            results.append(result)
            marker = "WARN" if result.qa.flags else "OK"
            special = " exception" if result.exception else ""
            print(
                f"[{i}/{len(verbs)}] {marker}{special} {verb} "
                f"{result.pos_tag} {result.tts_phonemes} flags={result.qa.flags}"
            )
        except Exception as exc:
            failures.append({"verb": verb, "error": repr(exc)})
            print(f"[{i}/{len(verbs)}] ERROR {verb}: {exc}")

    report = {
        "version": 2,
        "engine": "kokoro",
        "voice": VOICE,
        "language": "American English",
        "speed": SPEED,
        "method": "Misaki verb-context G2P -> validated exceptions -> direct KModel phonemes",
        "tail_silence_ms": TAIL_SILENCE_MS,
        "results": [
            {
                **{k: v for k, v in asdict(item).items() if k != "qa"},
                "qa": asdict(item.qa),
            }
            for item in results
        ],
        "failures": failures,
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    suspicious = sum(bool(item.qa.flags) for item in results)
    print(f"Generated: {len(results)}")
    print(f"Waveform warnings: {suspicious}")
    print(f"Failures: {len(failures)}")
    print(f"QA report: {report_path}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
