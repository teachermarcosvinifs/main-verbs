let currentAudio = null;
let currentButton = null;

function playAudio(path, button) {

  if (currentAudio) {

    currentAudio.pause();
    currentAudio.currentTime = 0;

  }

  removePlayingState();

  const audio = new Audio(path);

  currentAudio = audio;
  currentButton = button;

  button.classList.add('playing');

  audio.play().catch(error => {

    console.error('Erro ao reproduzir áudio:', error);

    removePlayingState();

  });

  audio.addEventListener('ended', () => {

    removePlayingState();

  });

  audio.addEventListener('pause', () => {

    if (audio.currentTime === 0 || audio.ended) {
      removePlayingState();
    }

  });

  audio.addEventListener('error', () => {

    console.error(`Erro ao carregar áudio: ${path}`);

    removePlayingState();

  });

}

function removePlayingState() {

  if (currentButton) {

    currentButton.classList.remove('playing');

  }

  currentAudio = null;
  currentButton = null;

}

function toggleTranslation(button) {

  const translation = button.nextElementSibling;

  const isVisible =
    translation.style.display === 'block';

  if (isVisible) {

    translation.style.display = 'none';

    button.textContent = 'Mostrar tradução';

    button.setAttribute('aria-expanded', 'false');

  } else {

    translation.style.display = 'block';

    button.textContent = 'Ocultar tradução';

    button.setAttribute('aria-expanded', 'true');

  }

}

window.addEventListener('beforeunload', () => {

  if (currentAudio) {

    currentAudio.pause();

  }

});

window.addEventListener('keydown', event => {

  if (event.code === 'Space') {

    const activeElement = document.activeElement;

    const isButton =
      activeElement.tagName === 'BUTTON';

    if (!isButton) {

      event.preventDefault();

    }

  }

});
