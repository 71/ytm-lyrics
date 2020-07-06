// ==UserScript==
// @name YouTube Music Lyrics
// @namespace Lyrics
// @match https://music.youtube.com/*
// @connect https://apic-desktop.musixmatch.com/*
// @noframes
// @grant GM_xmlhttpRequest
// @grant GM_getValue
// @grant GM_setValue
// ==/UserScript==


//////////////////////////////////////////////////////////////
/////  COMPAT  ///////////////////////////////////////////////
//////////////////////////////////////////////////////////////

if (GM_xmlhttpRequest === undefined)
  GM_xmlhttpRequest = GM.xmlHttpRequest
if (GM_getValue === undefined)
  GM_getValue = GM.getValue
if (GM_setValue === undefined)
  GM_setValue = GM.setValue


//////////////////////////////////////////////////////////////
/////  STYLE  ////////////////////////////////////////////////
//////////////////////////////////////////////////////////////

const style = document.createElement('style')

style.innerHTML = `
  .lyrics-wrapper {
    display: flex;
    position: fixed;
    width: 100%;
    height: 100%;
    z-index: 100;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 2em;
    pointer-events: none;
    bottom: var(--ytmusic-player-bar-height);
  }
  .lyrics-wrapper.hidden {
    display: none;
  }
  .lyrics-container {
    background: rgba(6, 6, 6, .85);
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
    font-size: min(2.8em, 4vmin);
    background: linear-gradient(to right, #780505, #942823);
  }
  ul.lyrics-list {
    text-align: center;
    font-size: 2.1em;
    line-height: 1.5;
    padding: 1em;
    position: relative;
    font-family: 'YT Sans', sans-serif;
  }
  ul.lyrics-list li {
    opacity: .7;
    list-style-type: none;
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
  .lyrics-delay {
    position: absolute;
    margin: 1em;
    pointer-events: none;
  }
`

document.body.appendChild(style)


//////////////////////////////////////////////////////////////
/////  FETCH AND CACHE LYRICS  ///////////////////////////////
//////////////////////////////////////////////////////////////

function fetchLyrics(track, artists) {
  return new Promise((resolve, reject) => {
    const artistsStr = artists.map(artist => `&q_artist=${encodeURIComponent(artist)}`).join('')

    const url = `https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get`
              + `?format=json&user_language=en&namespace=lyrics_synched`
              + `&f_subtitle_length_max_deviation=1&subtitle_format=mxm`
              + `&app_id=web-desktop-app-v1.0&usertoken=190511307254ae92ff84462c794732b84754b64a2f051121eff330`
              + `&q_track=${encodeURIComponent(track)}${artistsStr}`

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

        if ('track.subtitles.get' in macro_calls &&
            macro_calls['track.subtitles.get']['message']['body'] &&
            macro_calls['track.subtitles.get']['message']['body']['subtitle_list'] &&
            macro_calls['track.subtitles.get']['message']['body']['subtitle_list'].length > 0) {
          const subs = macro_calls['track.subtitles.get']['message']['body']['subtitle_list'][0].subtitle.subtitle_body

          return resolve(JSON.parse(subs))
        } else if ('matcher.track.get' in macro_calls &&
                   macro_calls['matcher.track.get']['message']['body']) {
          const info = macro_calls['matcher.track.get']['message']['body']['track']

          if (info.instrumental)
            return reject('Instrumental track.')
        }

        reject('Track not found.')
      },
    })
  })
}


//////////////////////////////////////////////////////////////
/////  HELPERS  //////////////////////////////////////////////
//////////////////////////////////////////////////////////////

function centerElementInContainer(element, container) {
  if (element == null)
    return

  const scrollTo = element.offsetTop - container.offsetHeight / 2 + element.offsetHeight / 2

  container.scrollTo(0, scrollTo)
}

function html(strings, ...args) {
  const template = document.createElement('template')

  template.innerHTML = String.raw(strings, ...args).trim()

  return template.content.firstChild
}


//////////////////////////////////////////////////////////////
/////  MAIN LOOP  ////////////////////////////////////////////
//////////////////////////////////////////////////////////////

function setup() {
  const STEP = 100

  // Set up out own elements
  const containerEl = document.body,
        controlsEl  = document.querySelector('.right-controls-buttons.ytmusic-player-bar')

  const controlEl = html`
    <paper-icon-button class="toggle-lyrics style-scope ytmusic-player-bar" icon="yt-icons:subtitles" title="Toggle lyrics" aria-label="Toggle lyrics" role="button">`

  const wrapperEl = html`
    <div class="lyrics-wrapper hidden">
      <div class="lyrics-container">
        <p class="lyrics-delay"></p>
        <ul class="lyrics-list">`

  controlsEl.insertBefore(controlEl, controlsEl.childNodes[2])
  containerEl.insertBefore(wrapperEl, containerEl.firstElementChild)

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

  const lyricsEl = wrapperEl.querySelector('ul.lyrics-list'),
        delayEl = wrapperEl.querySelector('p.lyrics-delay')

  controlEl.addEventListener('click', () => {
    wrapperEl.classList.toggle('hidden')

    centerElementInContainer(wrapperEl.querySelector('.active'), wrapperEl.firstElementChild)
  })

  let lyrics = [],
      activeLyric = undefined,
      autoScroll = true

  function setError(message) {
    controlEl.title = message
    controlEl.disabled = true

    if (document.fullscreenElement === wrapperEl.firstElementChild)
      document.exitFullscreen()

    controlEl.classList.add('error')
    wrapperEl.classList.add('hidden')
  }

  function clearError() {
    controlEl.title = 'Toggle lyrics'
    controlEl.disabled = false

    controlEl.classList.remove('error')
  }

  async function onSongChanged(track, artists, time) {
    clearError()
    lyricsEl.innerHTML = ''
    wrapperEl.firstElementChild.scrollTo(0, 0)

    try {
      const cacheKey = `${track} -- ${artists}`,
            cached = await GM_getValue(cacheKey)

      if (cached === undefined)
        GM_setValue(cacheKey, JSON.stringify(lyrics = await fetchLyrics(track, artists)))
      else
        lyrics = JSON.parse(cached)

      for (const lyric of lyrics) {
        const el = document.createElement('li'),
              text = lyric.text || (lyric === lyrics[lyrics.length - 1] ? '(end)' : '...')
        
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

      if (autoScroll) {
        centerElementInContainer(activeLyric.element, wrapperEl.firstElementChild)
      }
    } else {
      wrapperEl.firstElementChild.scrollTo(0, 0)
    }
  }


  let currentSong = '',
      currentArtists = '',
      currentTime = 0,
      currentS = 0,
      loadingCount = 0,
      delayMs = 0

  const progressEl = document.querySelector('.time-info')

  setInterval(() => {
    const trackNameEl = document.querySelector('.content-info-wrapper .title'),
          trackArtistsEls = [...document.querySelectorAll('.content-info-wrapper .subtitle a')]
                              .filter(x => x.pathname.startsWith('/channel/')
                                        || x.pathname.startsWith('/browse/FEmusic_library_privately_owned_artist_detail'))

    if (trackArtistsEls.length === 0) {
      const alt = document.querySelector('.content-info-wrapper .subtitle span')

      if (alt !== null)
        trackArtistsEls.push(alt)
    }

    const song = trackNameEl.textContent,
          artists = trackArtistsEls.map(x => x.textContent).filter(x => x.length > 0),
          timeMatch = /^\s*(\d+):(\d+)/.exec(progressEl.textContent),
          time = +timeMatch[1] * 60 + +timeMatch[2]

    if (song !== currentSong || artists.length !== currentArtists.length || artists.some((a, i) => currentArtists[i] !== a)) {
      if (song.length === 0 || artists.length === 0) {
        if (loadingCount < 10) {
          loadingCount++
          return
        }
      }

      onSongChanged(currentSong = song, currentArtists = artists, currentTime = time)
      loadingCount = delayMs = 0
    } else {
      // Interpolate milliseconds, this makes things MUCH smoother
      if (currentTime !== time)
        currentS = 0
      else
        currentS = Math.min(.95, currentS + STEP / 1000)

      onTimeChanged((currentTime = time) + currentS + delayMs / 1000)
    }
  }, STEP)

  let delayTimeout

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT')
      return

    if (e.keyCode === 88 /* X */) {
      if (delayTimeout) {
        clearTimeout(delayTimeout)
        delayTimeout = undefined
      }

      if (e.altKey)
        delayMs = 0
      else if (e.shiftKey)
        delayMs -= 100
      else
        delayMs += 100

      delayEl.innerText = `Delay: ${delayMs / 1000}s`
      delayTimeout = setTimeout(() => delayEl.innerText = '', 1000)
    }
    else if (e.keyCode === 83) {
      autoScroll = !autoScroll

      delayEl.innerText = `Autoscroll ${autoScroll ? 'enabled' : 'disabled'}`
      delayTimeout = setTimeout(() => delayEl.innerText = '', 1000)
    }
  })
}


let checkInterval = setInterval(() => {
  if (document.querySelector('.content-info-wrapper .subtitle span') === null)
    return

  clearInterval(checkInterval)
  setup()
}, 100)
