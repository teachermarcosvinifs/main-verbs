#!/usr/bin/env python3
"""
Generate isolated verb audio with Kokoro Michael using verb-resolved Misaki phonemes.

Design rules:
- American English only
- The visible verb is never changed
- POS ambiguity is resolved from an internal "to <verb>" context
- Kokoro receives the resolved phoneme string directly, bypassing a second G2P pass
- A short silence tail is appended only to the audio file
- QA metrics are emitted to JSON; suspicious items are retried at tiny speed variants
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import soundfile as sf
import torch
from kokoro import KModel, KPipeline

SAMPLE_RATE = 24000
VOICE = "am_michael"
DEFAULT_SPEEDS = (1.0, 1.03, 0.97)
TAIL_SILENCE_MS = 180

# Invisible grammatical contexts used only to resolve the verb reading
VERB_CONTEXTS = (
    "to {verb}",
    "I need to {verb} this",
    "They want to {verb} it",
)

STRESS_MARKS = {"ˈ", "ˌ"}
NONPHONE = STRESS_MARKS | {" ", ".", ",", ";", ":", "!", "?", "—", "…", '"', "'"}


@dataclass
class CandidateQA:
    speed: float
    duration_s: float
    peak: float
    rms: float
    silence_ratio: float
    tail_rms_ratio: float
    seconds_per_phone: float
    score: float
    flags: list[str]


@dataclass
class WordResult:
    verb: str
    context: str
    pos_tag: str
    phonemes: str
    output: str
    chosen_speed: float
    qa: CandidateQA


def load_verbs(path: Path) -> list[str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload if isinstance(payload, list) else payload.get("verbs", [])
    verbs = []
    for row in rows:
        verb = row if isinstance(row, str) else row.get("verb")
        if verb and str(verb).strip():
            verbs.append(str(verb).strip())
    if not verbs:
        raise RuntimeError(f"No verbs found in {path}")
    return verbs


def resolve_verb_phonemes(g2p, verb: str) -> tuple[str, str, str]:
    """Return (phonemes, POS tag, context), failing closed if POS is not verbal."""
    target = verb.casefold()
    diagnostics = []

    for template in VERB_CONTEXTS:
        context = template.format(verb=verb)
        _, tokens = g2p(context)
        matches = [
            token
            for token in tokens
            if token.text.casefold() == target and token.phonemes
        ]
        for token in matches:
            diagnostics.append((context, token.tag, token.phonemes))
            if token.tag and token.tag.startswith("VB"):
                return token.phonemes, token.tag, context

    # Never allow the TTS to guess a noun/adjective reading on a verb page
    raise RuntimeError(
        f"Could not resolve {verb!r} as a verb. Candidates: {diagnostics!r}"
    )


def phoneme_count(phonemes: str) -> int:
    return max(1, sum(1 for ch in phonemes if ch not in NONPHONE))


def audio_metrics(audio: np.ndarray, phonemes: str, speed: float) -> CandidateQA:
    audio = np.asarray(audio, dtype=np.float32).reshape(-1)
    if audio.size == 0:
        return CandidateQA(speed, 0, 0, 0, 1, 1, 0, 999, ["empty"])

    abs_audio = np.abs(audio)
    peak = float(abs_audio.max())
    rms = float(np.sqrt(np.mean(np.square(audio)) + 1e-12))
    duration = float(audio.size / SAMPLE_RATE)
    silence_ratio = float(np.mean(abs_audio < 0.0025))

    tail_n = min(audio.size, int(SAMPLE_RATE * 0.04))
    tail = audio[-tail_n:] if tail_n else audio
    tail_rms = float(np.sqrt(np.mean(np.square(tail)) + 1e-12))
    tail_ratio = float(tail_rms / max(rms, 1e-6))

    spp = duration / phoneme_count(phonemes)
    flags: list[str] = []

    if duration < 0.18:
        flags.append("too_short")
    if duration > 2.2:
        flags.append("too_long")
    if peak < 0.02:
        flags.append("too_quiet")
    if peak > 1.01:
        flags.append("clipping")
    if silence_ratio > 0.65:
        flags.append("too_much_silence")
    if tail_ratio > 1.35:
        flags.append("hot_tail")
    if spp < 0.025:
        flags.append("too_fast_for_phonemes")
    if spp > 0.22:
        flags.append("too_slow_for_phonemes")

    # Lower is better. Screening only: this does not pretend waveform metrics
    # can prove linguistic correctness.
    score = 0.0
    score += abs(math.log(max(spp, 1e-4) / 0.085))
    score += max(0.0, silence_ratio - 0.35) * 2.0
    score += max(0.0, tail_ratio - 0.9) * 0.7
    score += len(flags) * 1.25

    return CandidateQA(
        speed=speed,
        duration_s=round(duration, 4),
        peak=round(peak, 5),
        rms=round(rms, 5),
        silence_ratio=round(silence_ratio, 4),
        tail_rms_ratio=round(tail_ratio, 4),
        seconds_per_phone=round(spp, 4),
        score=round(score, 4),
        flags=flags,
    )


def synthesize_direct(model: KModel, voice_pack, phonemes: str, speed: float) -> np.ndarray:
    if len(phonemes) < 1:
        raise ValueError("Empty phoneme sequence")
    if len(phonemes) > len(voice_pack):
        raise ValueError(f"Phoneme sequence too long for voice pack: {len(phonemes)}")

    ref_s = voice_pack[len(phonemes) - 1]
    with torch.inference_mode():
        audio = model(phonemes, ref_s, speed)
    return audio.detach().cpu().numpy().astype(np.float32).reshape(-1)


def append_tail_silence(audio: np.ndarray, ms: int = TAIL_SILENCE_MS) -> np.ndarray:
    n = int(SAMPLE_RATE * ms / 1000)
    return np.concatenate([audio, np.zeros(n, dtype=np.float32)])


def generate_one(
    *,
    verb: str,
    model: KModel,
    pipeline: KPipeline,
    voice_pack,
    output_dir: Path,
    speeds: Iterable[float],
    overwrite: bool,
) -> WordResult:
    phonemes, tag, context = resolve_verb_phonemes(pipeline.g2p, verb)
    output = output_dir / f"{verb}-word.wav"

    if output.exists() and not overwrite:
        raise FileExistsError(
            f"{output} already exists. Use --overwrite or --resume at the caller level."
        )

    candidates: list[tuple[np.ndarray, CandidateQA]] = []
    for speed in speeds:
        audio = synthesize_direct(model, voice_pack, phonemes, speed)
        qa = audio_metrics(audio, phonemes, speed)
        candidates.append((audio, qa))

        # Prefer the canonical 1.0 speed when it looks healthy
        if speed == 1.0 and not qa.flags:
            break

    audio, qa = min(candidates, key=lambda item: item[1].score)
    sf.write(output, append_tail_silence(audio), SAMPLE_RATE, subtype="PCM_16")

    return WordResult(
        verb=verb,
        context=context,
        pos_tag=tag,
        phonemes=phonemes,
        output=str(output),
        chosen_speed=qa.speed,
        qa=qa,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/verbs.json")
    parser.add_argument("--out", default="audio/word-v2")
    parser.add_argument("--report", default="audio/word-v2/qa-report.json")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Skip WAVs that already exist instead of regenerating them",
    )
    args = parser.parse_args()

    data_path = Path(args.data)
    output_dir = Path(args.out)
    report_path = Path(args.report)
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    verbs = load_verbs(data_path)
    if args.limit:
        verbs = verbs[: args.limit]

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")
    print(f"Voice: {VOICE}")

    model = KModel().to(device).eval()
    # model=False avoids a duplicate model allocation; KPipeline is used only
    # for Misaki G2P and the selected voice pack.
    pipeline = KPipeline(lang_code="a", model=False)
    voice_pack = pipeline.load_voice(VOICE).to(device)

    results: list[WordResult] = []
    failures: list[dict] = []

    for i, verb in enumerate(verbs, 1):
        output = output_dir / f"{verb}-word.wav"
        if args.resume and output.exists():
            print(f"[{i}/{len(verbs)}] skip {verb}")
            continue

        try:
            result = generate_one(
                verb=verb,
                model=model,
                pipeline=pipeline,
                voice_pack=voice_pack,
                output_dir=output_dir,
                speeds=DEFAULT_SPEEDS,
                overwrite=args.overwrite or args.resume,
            )
            results.append(result)
            marker = "WARN" if result.qa.flags else "OK"
            print(
                f"[{i}/{len(verbs)}] {marker} {verb} "
                f"{result.pos_tag} {result.phonemes} speed={result.chosen_speed} "
                f"flags={result.qa.flags}"
            )
        except Exception as exc:
            failures.append({"verb": verb, "error": repr(exc)})
            print(f"[{i}/{len(verbs)}] ERROR {verb}: {exc}")

    report = {
        "version": 1,
        "engine": "kokoro",
        "voice": VOICE,
        "language": "American English",
        "method": "Misaki verb-context G2P -> direct KModel phonemes",
        "sample_rate": SAMPLE_RATE,
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

    suspicious = sum(1 for item in results if item.qa.flags)
    print()
    print(f"Generated: {len(results)}")
    print(f"Suspicious by waveform heuristics: {suspicious}")
    print(f"Failures: {len(failures)}")
    print(f"QA report: {report_path}")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
