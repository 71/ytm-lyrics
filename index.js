// ==UserScript==
// @name Spotify Lyrics
// @namespace Violentmonkey Scripts
// @match https://open.spotify.com/*
// @noframes
// @grant GM_xmlhttpRequest
// @grant GM_getValue
// @grant GM_setValue
// ==/UserScript==


const style = document.createElement('style')

style.innerHTML = `
  .main-view-container {
    position: relative;
  }

  .lyrics-wrapper {
    display: flex;
    position: absolute;
    width: 100%;
    height: 100%;
    z-index: 100;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 2em;
    pointer-events: none;
  }

  .lyrics-wrapper.hidden {
    display: none;
  }

  .lyrics-container {
    background: rgba(40, 40, 40, .85);
    height: 300px;
    width: 600px;
    overflow: scroll;
    color: white;
    box-shadow: 0 4px 12px 4px rgba(0,0,0,.5);
    border-radius: 5px;
    pointer-events: auto;
  }

  .lyrics-container::-webkit-scrollbar {
    display: none;
  }

  .lyrics-container:fullscreen {
    font-size: 2em;
    background: linear-gradient(to right, #42275a, #734b6d);
  }

  ul.lyrics-list {
    text-align: center;
    font-size: 1.8em;
    line-height: 1.5;
    padding: 1em;
    position: relative;
  }

  ul.lyrics-list li {
    opacity: .7;
  }

  ul.lyrics-list li.other {
    opacity: .5;
  }

  ul.lyrics-list li.active {
    opacity: 1;
    font-size: 1.4em;
    font-weight: bold;
    margin: .4em 0;
  }

  .lyrics-toggle-control.error button {
    color: #5a5a5a;
  }

  .spoticon-toggle-lyrics::before {
    content: "\\f134";
    font-size: 16px;
    transform: translateX(-1px);
  }
`

document.body.appendChild(style)


function fetchLyrics(track, artists) {
  return new Promise((resolve, reject) => {
    const url = `https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get`
              + `?format=json&user_language=en&namespace=lyrics_synched`
              + `&f_subtitle_length_max_deviation=1&subtitle_format=mxm`
              + `&app_id=web-desktop-app-v1.0&usertoken=190511307254ae92ff84462c794732b84754b64a2f051121eff330`
              + `&q_track=${encodeURIComponent(track)}&q_artist=${encodeURIComponent(artists)}`

    GM_xmlhttpRequest({
      url,
      method: 'GET',

      headers: {
        Cookie: 'AWSELB=55578B011601B1EF8BC274C33F9043CA947F99DCFF0A80541772015CA2B39C35C0F9E1C932D31725A7310BCAEB0C37431E024E2B45320B7F2C84490C2C97351FDE34690157',
        Origin: 'musixmatch.com',
      },

      onabort: () => reject(),
      onerror: () => reject(),

      onloadend: res => {
        const { message: { body: { macro_calls } } } = JSON.parse(res.responseText)

        if ('track.subtitles.get' in macro_calls && macro_calls['track.subtitles.get']['message']['body']['subtitle_list'] && macro_calls['track.subtitles.get']['message']['body']['subtitle_list'].length > 0) {
          const subs = macro_calls['track.subtitles.get']['message']['body']['subtitle_list'][0].subtitle.subtitle_body

          return resolve(JSON.parse(subs))
        } else if ('matcher.track.get' in macro_calls && macro_calls['matcher.track.get']['message']) {
          const info = macro_calls['matcher.track.get']['message']['body']['track']

          if (info.instrumental)
            return reject('Instrumental track.')
        }

        reject('Track not found.')
      },
    })
  })
}

function centerElementInContainer(element, container) {
  const scrollTo = element.offsetTop - container.offsetHeight / 2 + element.offsetHeight / 2

  container.scrollTo(0, scrollTo)
}


function setup() {
  // To pick an icon:
  // - Create an element with style: "font-family: glue1-spoticon; color: white; font-style: normal; font-weight: 400; z-index: 900; font-size: 1.8em;"
  // - Select it, and set its content using: "for (let i = 0xf100; i < 0xf2b0; i++) $0.innerHTML += '<span>' + String.fromCharCode(i) + '</span>'"
  //
  // Choose! 
  const STEP = 100

  const spotifyContainerEl = document.querySelector('.main-view-container'),
        spotifyControlsEl  = document.querySelector('.ExtraControls')

  const controlEl = document.createElement('div'),
        wrapperEl = document.createElement('div')


  wrapperEl.className = 'lyrics-wrapper hidden'
  wrapperEl.innerHTML = `<div class="lyrics-container"><ul class="lyrics-list"></ul></div>`
  
  wrapperEl.addEventListener('dblclick', () => {
    if (document.fullscreenElement)
      document.exitFullscreen()
    else
      wrapperEl.firstElementChild.requestFullscreen()

    document.getSelection().removeAllRanges()
  })
  
  wrapperEl.firstElementChild.addEventListener('fullscreenchange', () => {
    centerElementInContainer(wrapperEl.querySelector('.active'), wrapperEl.firstElementChild)
  })
  
  const lyricsEl = wrapperEl.querySelector('ul.lyrics-list')

  controlEl.className = 'lyrics-toggle-control'
  controlEl.innerHTML = `<button class="control-button spoticon-toggle-lyrics" title="Toggle lyrics"></button>`
  
  controlEl.firstChild.addEventListener('click', () => {
    wrapperEl.classList.toggle('hidden')

    centerElementInContainer(wrapperEl.querySelector('.active'), wrapperEl.firstElementChild)
  })

  spotifyControlsEl.insertBefore(controlEl, spotifyControlsEl.firstElementChild)
  spotifyContainerEl.insertBefore(wrapperEl, spotifyContainerEl.firstElementChild)

  let lyrics = [],
      activeLyric = undefined


  function setError(message) {
    controlEl.firstElementChild.title = message
    controlEl.firstElementChild.disabled = true

    controlEl.classList.add('error')
    wrapperEl.classList.add('hidden')
  }

  function clearError() {
    controlEl.firstElementChild.title = 'Toggle lyrics'
    controlEl.firstElementChild.disabled = false

    controlEl.classList.remove('error')
  }

  async function onSongChanged(track, artists, time) {
    clearError()
    lyricsEl.innerHTML = ''
    wrapperEl.firstElementChild.scrollTo(0, 0)

    try {
      const cacheKey = `${track} -- ${artists}`,
            cached = GM_getValue(cacheKey)

      if (cached === undefined)
        GM_setValue(cacheKey, JSON.stringify(lyrics = await fetchLyrics(track, artists)))
      else
        lyrics = JSON.parse(cached)

      for (const lyric of lyrics) {
        const el = document.createElement('li'),
              text = lyric.text || (lyric === lyrics[lyrics.length - 1] ? '(end)' : '(pause)')
        
        if (text === '')
          el.classList.add('other')

        el.setAttribute('data-time', lyric.time.total)
        el.setAttribute('data-text', lyric.text)

        el.innerText = text

        lyric.element = el
        lyricsEl.appendChild(el)
      }

      lyrics.reverse()
      onTimeChanged(time)
    } catch (err) {
      setError(err)
    }
  }

  function onTimeChanged(time) {
    const newActiveLyric = lyrics.find(x => x.time.total <= time)

    if (activeLyric !== undefined) {
      if (activeLyric === newActiveLyric)
        return

      activeLyric.element.classList.remove('active')
    }

    if ((activeLyric = newActiveLyric) !== undefined) {
      activeLyric.element.classList.add('active')
      centerElementInContainer(activeLyric.element, wrapperEl.firstElementChild)
    } else {
      wrapperEl.firstElementChild.scrollTo(0, 0)
    }
  }


  let currentSong = '',
      currentArtists = '',
      currentTime = 0,
      currentMs = 0

  const [currentTimeEl, endTimeEl] = document.querySelectorAll('.playback-bar__progress-time')

  const trackNameEl = document.querySelector('.track-info__name'),
        trackArtistsEl = document.querySelector('.track-info__artists')

  setInterval(() => {
    const song = trackNameEl.textContent,
          artists = trackArtistsEl.textContent,
          timeMatch = /^(\d+):(\d+)$/.exec(currentTimeEl.textContent),
          time = +timeMatch[1] * 60 + +timeMatch[2]

    if (song !== currentSong || artists !== currentArtists) {
      onSongChanged(currentSong = song, currentArtists = artists, currentTime = time)
    } else {
      // Interpolate milliseconds, this makes things MUCH smoother
      if (currentTime !== time)
        currentMs = 0
      else
        currentMs = Math.min(.95, currentMs + STEP / 1000)

      onTimeChanged((currentTime = time) + currentMs)
    }
  }, STEP)
}


let checkInterval = setInterval(() => {
  if (document.getElementsByClassName('track-info__name').length === 0)
    return
  
  clearInterval(checkInterval)
  setup()
}, 100)
 
