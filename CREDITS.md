# Credits

Sicklunar is built on public science. Every fact in it comes from a source we can point to; the full list of links is in the data files in `cislunar/research_data/`.

## Orbits and positions
- **Three-Body Periodic Orbits**: initial states, periods and stability of 48 orbit families (42 Earth–Moon, 6 Sun–Earth) from the [Three-Body Periodic Orbits API](https://ssd-api.jpl.nasa.gov/doc/periodic_orbits.html) of JPL's Solar System Dynamics group. Courtesy NASA/JPL-Caltech. Cached in `cislunar/jpl_cache/`.
- **Sun and Moon positions, lunar librations**: low-precision formulas from Jean Meeus, *Astronomical Algorithms* (2nd ed., Willmann-Bell, 1998), chapters 12, 25, 47 and 53, written as our own code (`web/src/mission/ephem.ts`).

## Images
- **Earth**: "Equirectangular Projected Earth for LARGEST", NASA/Goddard Space Flight Center Scientific Visualization Studio ([SVS #3615](https://svs.gsfc.nasa.gov/3615)). Blue Marble Next Generation data courtesy of Reto Stöckli (NASA/GSFC) and NASA's Earth Observatory. Public domain.
- **Moon**: "CGI Moon Kit", NASA's Scientific Visualization Studio ([SVS #4720](https://svs.gsfc.nasa.gov/4720)): Ernie Wright (visualizer), Noah Petro (scientist). Colour from the Lunar Reconnaissance Orbiter Camera wide-angle mosaic (NASA/GSFC/Arizona State University). Public domain.

NASA images are used under [NASA's media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/); their use doesn't mean NASA endorses this project. Sicklunar is independent and isn't affiliated with NASA, JPL or any space agency.

## Research data
Compiled for Sicklunar. Every record carries its source links and a Fact / Reported / Inference label.
- **Launch sites (10)**, `launch_sites.json`: launch-vehicle user's guides (SpaceX, Rocket Lab, Arianespace, Mitsubishi Heavy Industries, Starsem), NASA, CNSA, JAXA, ISRO, Wikipedia.
- **Moon sites (47)**, `lunar_sites.json`: Lunar Reconnaissance Orbiter Camera team (Arizona State University), NASA, NASA NSSDC, IAU/USGS Gazetteer of Planetary Nomenclature, USGS ScienceBase.
- **Missions (131)**, `missions.json`: NASA NSSDC, NASA, Gunter's Space Page, space agencies, Wikipedia.
- **Transfers (50 legs)**, `transfers.json`: Lunar and Planetary Institute, NASA Technical Reports Server, JPL DESCANSO, Purdue University, AMOS conference papers, ESA.
- **Coverage sensors (17) and findings (11)**, `sda.json`: AMOS conference papers, arXiv, Space Symposium, Purdue University, JPL, ESA.

## Software and fonts
- [three.js](https://threejs.org) (MIT, © three.js authors), plus its OrbitControls and CSS2DRenderer add-ons.
- [Vite](https://vite.dev) (MIT) and [TypeScript](https://www.typescriptlang.org) (Apache-2.0) to build the site.
- [NumPy](https://numpy.org), [SciPy](https://scipy.org) (BSD-3-Clause) and [Matplotlib](https://matplotlib.org) to compute the data.
- Fonts: [Saira](https://github.com/Omnibus-Type/Saira) (Omnibus-Type) and [Atkinson Hyperlegible Next](https://www.brailleinstitute.org/freefont/) (Braille Institute), both under the SIL Open Font License 1.1, served from this site via Fontsource.
