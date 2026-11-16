import { esc, normalize, $ } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { getYouTubeId, ytThumb, ytEmbed } from '../utils/youtube.js';

const idOf = (t) => t.youtube_id || getYouTubeId(t.youtube_url);

function thumb(video, id) {
  return id
    ? `<img src="${ytThumb(id)}" alt="" loading="lazy" width="480" height="360">`
    : `<div class="video-thumb--soon">${icon('play')}<span>Video próximamente</span></div>`;
}

function videoCard(video) {
  const id = idOf(video);
  const search = normalize(`${video.title} ${video.description} ${video.category}`);
  return `<article class="card video-card" data-cat="${esc(video.category)}" data-search="${esc(search)}">
    <button class="video-card__btn" data-video="${esc(video.id)}" ${id ? '' : 'disabled'} aria-label="Reproducir ${esc(video.title)}">
      <span class="video-card__thumb">${thumb(video, id)}${id ? `<span class="video-card__play">${icon('play')}</span>` : ''}</span>
    </button>
    <div class="card__body">
      <span class="tag tag--soft">${esc(video.category)}</span>
      <h3 class="card__title card__title--sm">${esc(video.title)}</h3>
      <p class="card__text">${esc(video.description)}</p>
    </div>
  </article>`;
}

function showInPlayer(player, video, autoplay) {
  const id = idOf(video);
  if (!id) {
    player.innerHTML = `<div class="player__empty">${icon('play', 'icon icon--xl')}
      <p><strong>Video próximamente</strong></p></div>`;
    return;
  }
  player.innerHTML = autoplay
    ? `<iframe src="${ytEmbed(id)}" title="${esc(video.title)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`
    : `<button class="player__facade" aria-label="Reproducir ${esc(video.title)}">
        <img src="${ytThumb(id)}" alt=""><span class="player__play">${icon('play', 'icon icon--xl')}</span>
        <span class="player__title">${esc(video.title)}</span></button>`;
  if (!autoplay) $('.player__facade', player).addEventListener('click', () => showInPlayer(player, video, true));
}

/** Pinta la galería. Devuelve false, sin pintar nada, si aún no hay ningún video publicado. */
export function renderVideos(grid, player, videos) {
  if (!videos.some((v) => idOf(v))) {
    grid.innerHTML = '';
    player.innerHTML = '';
    return false;
  }
  grid.innerHTML = videos.map(videoCard).join('') || '<p class="empty">Aún no hay videos publicados.</p>';
  const first = videos.find((v) => idOf(v)) ?? videos[0];
  showInPlayer(player, first ?? {}, false);
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-video]');
    if (!btn) return;
    const video = videos.find((v) => v.id === btn.dataset.video);
    if (!video) return;
    showInPlayer(player, video, true);
    player.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  return true;
}
