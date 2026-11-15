<p align="center">
  <img src="docs/demo.gif" alt="hello, grown out of ASCII flowers" width="720">
</p>

# ASCII Garden

Type, and a garden grows out of the letters, drawn entirely in text characters.

Stems curl up out of every letter and end in flowers. Space cuts the stems so the next word grows its own garden, backspace withers, enter clears.

## Credits

ASCII Garden is a reinterpretation of **[Type Garden](https://type-garden.vercel.app/) by Akshat Agarwal**: type and stems and roses grow out of the letters. The growth, the motion and the look of the stems and roses come from that original. Please go and enjoy the real thing.

Also built on the work of others:

- **[ascii-animals](https://github.com/DesignerStephen1/ascii-animals)** by drewdi / DesignerStephen1 (MIT): the cell-grid ASCII rendering approach, the liquid-glass filter and the Tweaks panel are adapted from it.
- **[GSAP](https://gsap.com)** (all animation and the frame loop) and **[Lenis](https://lenis.darkroom.engineering)** (smooth scroll).
- Fonts from Google Fonts: Playfair Display, JetBrains Mono, Geist, Inter and Instrument Serif.

## Features

- **Ten flowers** (rose, tulip, daisy, poppy, blossom, lily, bell, lavender, fern, puff). **Build your own mix**: toggle any species on or off (shift-click to grow only one) and change a species' colour; flowers already on screen swap live.
- **Chaos slider**: from minimal botanical typography to the garden taking over.
- **Separate ASCII for text and flowers**: each has its own cell size.
- **Export your garden** as a clean looping **MP4**, **GIF** or PNG frames (seven motion presets), or **record** it live as you type.
- **Export**: PNG, SVG (text), and **copy-paste code** for React, HTML + Tailwind or HTML + CSS. The code embeds the whole engine, so it has no dependencies.
- **Liquid-glass UI** with a Tweaks panel. Your palette, tweaks and last words are saved in the browser.

## Make the demo GIF

Two ways, both from the Type tab:

- **Record it live**: press **● GIF** (or **● MP4**), type `ASCII Garden` and watch it bloom, then press **■ Stop**. It captures just the garden, as you made it.
- **Export a clean loop**: type your words, pick a motion preset in Tweaks (**Typed** types, cuts and repeats; **Grow & wither** blooms and fades), then **Export ▾ → GIF loop**. It renders a 720 x 720, 20 fps loop. The same menu also makes a 1080 x 1080 **MP4** and **PNG frames**.

The Poster tab has the same exports. Save the GIF as `docs/demo.gif`.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-checks and builds to dist/
```

`npm run dev` and `npm run build` first run `npm run gen`, which bundles the dependency-free engine (`src/standalone/engine.min.js`) that the code export pastes into its snippets.

## Controls

| | |
| --- | --- |
| type | grow letters (or tap, on a phone) |
| space | cut the stems |
| backspace | wither the last letter |
| enter | clear |
| click | a butterfly lands on a flower |
| double-click | plant a rose |

## License

MIT, see [LICENSE](LICENSE). The original Type Garden and the projects credited above keep their own licences and copyrights.
