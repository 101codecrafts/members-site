# SSIM log (colour SSIM, skimage, full page + per-region)

Screenshots taken with headless Chromium at the mockup viewport, `?static=1` (animations and live API calls off).

| Page | Round | Full SSIM | Weakest regions | Change |
|---|---|---|---|---|
| dashboard | 1 | 0.7933 | activity 0.688, latest 0.718, featured 0.752 | first full draft, assets cropped from mockup |
| dashboard | 2 | 0.8053 | activity 0.688, latest 0.718 | hero heading calibrated to Russo One 51.6px, photo layered over hero (laptop overlap), sidebar text sizes |
| dashboard | 3 | 0.8116 | activity 0.707, latest 0.718 | heading baseline, activity card text, tool descriptions |
| landing | 1 | 0.7358 | testimonials 0.538, hero_text 0.609, features 0.630 | first full draft |
| landing | 2 | 0.7611 | testimonials 0.577, features 0.643, hero_text 0.677 | Archivo Black hero (glyph-SSIM font search) + automatic per-element text fit (tools/tune.py) |
| dashboard | 8 | 0.8399 | activity 0.756, latest 0.772, featured 0.789 | automatic per-element text fit (tools/tune.py, 5 passes) |
| landing | 3 | 0.7638 | testimonials 0.586, features 0.658, hero_text 0.678 | mockup line breaks forced, icon sizes, tuner now also aligns icons |
| dashboard | 9 | 0.8425 | activity 0.763, latest 0.773, featured 0.791 | mockup line breaks forced, tuner re-run with icons |
| landing | 4 | 0.7730 | features 0.669, hero_text 0.687, testimonials 0.659 | testimonial heading block re-positioned, tuner may scale multi-line text |
