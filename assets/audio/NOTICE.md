# Audio credits

`shot.wav` and `bolt.wav`: “Chaingun, pistol, rifle, shotgun shots” by Michel Baradari (original attribution apollo-music.de), submitted by qubodup. Source: https://opengameart.org/node/2566 . License: Creative Commons Attribution 3.0, https://creativecommons.org/licenses/by/3.0/ . Changes: selected/cropped cg1.wav and rifle.wav, filtering, fades, gain and playback variation for RealShot. Original attribution retained in `MICHEL-ORIGINAL.txt`.

`hit-0.wav`, `hit-1.wav`, `case-0.wav`, `case-1.wav`, `break.wav`: Kenney, “Impact Sounds”, CC0 1.0, https://kenney.nl/assets/impact-sounds . Original files are impactMetal_heavy_000/001, impactMetal_light_000/001 and impactGlass_medium_000. Changes: PCM conversion, high-pass filter and gain. Downloaded from a public mirror at https://github.com/Mcamento8/open-game-sfx-index/tree/34bbe8b525b5ceff3804915ea745532af11f6055/audio/impact-sounds ; upstream creator/license checked separately.

RealShot's Web Audio mix adds a short low-frequency transient, close mechanical layer, per-shot pitch/gain variation and material-specific hit mixes. No background music.

`wall.wav` and `wall-body.wav`: Kenney Impact Sounds, impactMining_000.ogg and impactSoft_heavy_000.ogg, same CC0 pack and pinned mirror above; PCM conversion, 65 Hz high-pass, 6500 Hz low-pass and gain. Used for a distant plaster/stone impact layer.

The close-contact interceptor mix reuses these same licensed samples for ordinary metal contact, armor separation, and body destruction. Target distance controls attenuation and a low-pass filter, and horizontal position controls stereo panning. Small clatter and reflection tails use the game clock so pause and restart remain consistent. Primary target contact starts when the simulated projectile arrives; it does not add a second flight delay. These mixes and the small procedural low-frequency transient were made for this project.
