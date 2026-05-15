/* =========================
   AUDIO SYSTEM
========================= */

const audioPlayer = new Audio();

function stopCurrentAudio(){

  audioPlayer.pause();
  audioPlayer.currentTime = 0;
}

function playAudio(path){

  if(!path) return;

  stopCurrentAudio();

  audioPlayer.src = path;

  audioPlayer.play().catch((error)=>{

    console.error(
      "Erro ao reproduzir áudio:",
      error
    );
  });
}

/* =========================
   AUDIO BUTTONS
========================= */

document
  .querySelectorAll(".btn-audio")
  .forEach((button)=>{

    button.addEventListener("click", ()=>{

      const audioPath =
        button.dataset.audio;

      playAudio(audioPath);
    });
});

/* =========================
   TRANSLATION TOGGLE
========================= */

document
  .querySelectorAll(".btn-translation")
  .forEach((button)=>{

    button.addEventListener("click", ()=>{

      const translation =
        button
          .parentElement
          .querySelector(".translation");

      if(!translation) return;

      const isVisible =
        translation.classList.contains("show");

      document
        .querySelectorAll(".translation")
        .forEach((item)=>{

          item.classList.remove("show");
        });

      document
        .querySelectorAll(".btn-translation")
        .forEach((btn)=>{

          btn.textContent =
            "Mostrar tradução";
        });

      if(!isVisible){

        translation.classList.add("show");

        button.textContent =
          "Ocultar tradução";
      }
    });
});

/* =========================
   ACTIVE BUTTON FEEDBACK
========================= */

document
  .querySelectorAll(".btn-audio")
  .forEach((button)=>{

    button.addEventListener("click", ()=>{

      button.classList.add("playing");

      setTimeout(()=>{

        button.classList.remove("playing");

      }, 250);
    });
});

/* =========================
   PERFORMANCE HELPERS
========================= */

document
  .querySelectorAll(".verb-row")
  .forEach((row)=>{

    row.addEventListener("mouseenter", ()=>{

      row.style.willChange =
        "transform, background";
    });

    row.addEventListener("mouseleave", ()=>{

      row.style.willChange =
        "auto";
    });
});

/* =========================
   AUDIO FINISHED RESET
========================= */

audioPlayer.addEventListener("ended", ()=>{

  document
    .querySelectorAll(".btn-audio")
    .forEach((button)=>{

      button.classList.remove("playing");
    });
});

/* =========================
   AUDIO ERROR HANDLING
========================= */

audioPlayer.addEventListener("error", ()=>{

  console.error(
    "Erro ao carregar o arquivo de áudio."
  );

  document
    .querySelectorAll(".btn-audio")
    .forEach((button)=>{

      button.classList.remove("playing");
    });
});

/* =========================
   OPTIONAL KEYBOARD SUPPORT
========================= */

document.addEventListener("keydown", (event)=>{

  if(event.code === "Space"){

    const activeElement =
      document.activeElement;

    if(
      activeElement &&
      activeElement.classList.contains("btn-audio")
    ){

      event.preventDefault();

      activeElement.click();
    }
  }
});
