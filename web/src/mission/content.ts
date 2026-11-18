// Kid-friendly explanatory content for the Mission Planner (ages ~10-20).
//
// Conventions
// - 1 fuel unit = 100 m/s of delta-v (speed change). Reaching orbit (~93 units)
//   is paid by the rocket's lower stages; the spacecraft's own tank starts
//   with ~45 units in low Earth orbit.
// - `short` / `caption`: about grade-6 reading level. `more` / `why`: about grade 9.
// - Unit numbers come from cislunar/research_data/transfers.json (km/s x 10),
//   rounded. Model numbers (CR3BP) differ a little from real flight numbers.
// - Captions may use the placeholders {site}, {units}, {days}, {dest}.
// - Self-contained: no imports, so this file type-checks on its own.

export type PhaseId =
  | 'launch'
  | 'parking'
  | 'tli'
  | 'coast'
  | 'flyby'
  | 'loi'
  | 'insert'
  | 'wait'
  | 'descent'
  | 'landed'
  | 'gto'
  | 'geo'
  | 'return'
  | 'splashdown'
  | 'arrived';

export type DestId =
  | 'leo'
  | 'geo'
  | 'flyby'
  | 'llo'
  | 'surface'
  | 'nrho'
  | 'dro'
  | 'l1halo'
  | 'l2halo'
  | 'l4';

export interface GlossaryEntry {
  term: string;
  short: string;
  more?: string;
}

export interface PhaseText {
  title: string;
  caption: string;
  why: string;
}

export interface Destination {
  name: string;
  /** id of the orbit-diagram glyph in icons.ts */
  glyph: string;
  tagline: string;
  story: string;
  real_missions: string[];
}

export interface Challenge {
  id: string;
  title: string;
  brief: string;
  constraints: {
    dest?: DestId;
    maxUnits?: number;
    site?: string;
    requireSunriseLanding?: boolean;
    landingSite?: string;        // id in lunar_sites.json
    landingRegion?: string;      // e.g. 'south-pole', 'far-side'
    requireLitLanding?: boolean; // Sun up at the site (and Earth up, where Earth can rise)
    compareSites?: boolean;
  };
  success: string;
  hint: string;
}

// ---------------------------------------------------------------------------
// 1) Glossary
// ---------------------------------------------------------------------------

export const GLOSSARY: Record<string, GlossaryEntry> = {
  orbit: {
    term: 'Orbit',
    short: 'An orbit is a path where something keeps falling around a planet or moon but moves sideways so fast that it keeps missing the ground.',
    more: 'Nothing holds a spacecraft up in orbit; it is falling the whole time. Near Earth you need a sideways speed of about 7.8 km/s (78 fuel units) so the ground curves away as fast as you fall.',
  },
  'low-earth-orbit': {
    term: 'Low Earth orbit (LEO)',
    short: 'Low Earth orbit is the closest ring of space around Earth, just above the air, where the space station flies.',
    more: 'LEO runs from about 200 km up to about 2,000 km. The International Space Station flies about 400 km up and goes around Earth in about 92 minutes.',
    // source: https://en.wikipedia.org/wiki/International_Space_Station
  },
  'parking-orbit': {
    term: 'Parking orbit',
    short: 'A parking orbit is a short stop in low Earth orbit where the crew checks the spacecraft before the big push to somewhere else.',
    more: 'It also lets the spacecraft wait for the right moment: the next burn has to happen at the right spot in the orbit to aim at the Moon or at GEO. Apollo 11 spent about one and a half orbits in its parking orbit.',
  },
  'delta-v': {
    term: 'Delta-v',
    short: 'Delta-v means "change in speed", and it is how space engineers measure how much fuel a trip needs.',
    more: '"Delta" is the math symbol for change and "v" stands for velocity (speed plus direction). Turning, speeding up and slowing down all cost delta-v, because each one changes your velocity.',
  },
  'fuel-unit': {
    term: 'Fuel unit',
    short: 'In this app, one fuel unit is enough fuel to change your speed by 100 meters per second.',
    more: '100 m/s is 360 km/h, faster than a race car. Leaving low Earth orbit for the Moon takes about 31 units, so about 3,100 m/s.',
  },
  burn: {
    term: 'Burn',
    short: 'A burn is when the spacecraft fires its engine to speed up, slow down or turn.',
    more: 'Most of a space trip has the engine off. A few short, carefully timed burns, from seconds to minutes long, decide the whole path.',
  },
  thrust: {
    term: 'Thrust',
    short: 'Thrust is the push an engine makes by throwing hot gas out the back very fast.',
    more: 'It works by action and reaction, like a skateboarder throwing a heavy ball forward and rolling backward. It needs no air to push against, so it works in empty space.',
  },
  gravity: {
    term: 'Gravity',
    short: 'Gravity is the pull every object has on every other object, and bigger objects pull harder.',
    more: 'Gravity gets weaker with distance: twice as far away means one quarter of the pull. The Moon\'s surface gravity is about one sixth of Earth\'s, which is why landing and taking off there is much cheaper.',
  },
  'escape-velocity': {
    term: 'Escape velocity',
    short: 'Escape velocity is the speed you need to coast away from a planet and never fall back.',
    more: 'At Earth\'s surface it is about 11.2 km/s. The Moon\'s escape velocity is only about 2.4 km/s, because it has much less mass.',
  },
  tli: {
    term: 'Trans-lunar injection (TLI)',
    short: 'TLI is the big engine burn that throws a spacecraft out of Earth orbit and onto a path to the Moon.',
    more: '"Trans-lunar" means "across to the Moon" and "injection" means putting the spacecraft onto a new path. It costs about 31 units (3.1 km/s) from low Earth orbit and takes only a few minutes.',
    // source: https://www.nasa.gov/wp-content/uploads/2023/10/nrho-artemis-orbit.pdf
  },
  coast: {
    term: 'Coast',
    short: 'Coasting means flying with the engine off and letting speed and gravity carry you.',
    more: 'In space there is no air to slow you down, so a spacecraft can coast for days for free. The trip to the Moon is mostly coasting: about 3 to 5 days after TLI.',
  },
  apogee: {
    term: 'Apogee',
    short: 'Apogee is the point of an oval Earth orbit that is farthest from Earth.',
    more: 'A spacecraft moves slowest at apogee, so that is the cheapest place to change the orbit\'s tilt or to round out the orbit. Geostationary transfer orbits have their apogee about 35,786 km up.',
  },
  perigee: {
    term: 'Perigee',
    short: 'Perigee is the point of an oval Earth orbit that is closest to Earth.',
    more: 'A spacecraft moves fastest at perigee. Burning there to speed up raises the far side of the orbit very efficiently, which is why big departure burns like TLI happen low and fast.',
  },
  perilune: {
    term: 'Perilune',
    short: 'Perilune is the closest point to the Moon on a path or orbit around it.',
    more: '"Luna" is Latin for Moon. On Artemis II, perilune was about 4,067 miles (6,545 km) above the lunar surface.',
    // source: https://www.nasa.gov/news-release/nasa-welcomes-record-setting-artemis-ii-moonfarers-back-to-earth/
  },
  apolune: {
    term: 'Apolune',
    short: 'Apolune is the farthest point from the Moon on an orbit around it.',
    more: 'In the near-rectilinear halo orbit (NRHO), apolune is about 70,000 km from the Moon\'s center while perilune is only about 3,200 km, so the orbit is a very stretched loop.',
    // source: https://engineering.purdue.edu/people/kathleen.howell.1/Publications/Conferences/2020_AAS_DavKhoHowSwe.pdf
  },
  inclination: {
    term: 'Inclination',
    short: 'Inclination is how much an orbit is tilted compared with the equator.',
    more: 'An orbit with 0° inclination stays over the equator; 90° passes over both poles. The space station\'s orbit is tilted 51.6°, so it flies over places as far north and south as 51.6° latitude.',
    // source: https://en.wikipedia.org/wiki/International_Space_Station
  },
  equator: {
    term: 'Equator',
    short: 'The equator is the imaginary line around the middle of Earth, halfway between the North and South Poles.',
    more: 'It is where Earth\'s surface moves fastest as the planet spins, about 465 m/s. Geostationary satellites sit right above it.',
  },
  latitude: {
    term: 'Latitude',
    short: 'Latitude tells you how far north or south of the equator a place is, in degrees.',
    more: 'The equator is 0° and the poles are 90°. Cape Canaveral is at about 28.5° N, which is why many orbits launched from Florida are tilted about 28.5°.',
  },
  'spin-bonus': {
    term: "Earth's spin bonus",
    short: 'Earth spins toward the east, so a rocket launched eastward gets a free head start.',
    more: 'At the equator the ground moves about 465 m/s (4.6 units); at Cape Canaveral about 410 m/s (4.1 units). Launching west means fighting that motion instead, so almost nobody does it.',
    // source: https://orbitalradar.com/blog/why-do-rockets-launch-from-florida
  },
  'plane-change': {
    term: 'Plane change',
    short: 'A plane change is a burn that tilts your orbit to a new angle, and it is one of the most expensive moves in space.',
    more: 'To tilt, you have to push sideways against all your speed. In low Earth orbit, tilting just 10° costs about 14 units, which is why engineers do plane changes far out, where the spacecraft moves slowly.',
  },
  geo: {
    term: 'Geostationary orbit (GEO)',
    short: 'A geostationary satellite circles Earth exactly as fast as Earth spins, so it seems to hang still over one spot.',
    more: 'It sits 35,786 km above the equator and takes 23 hours 56 minutes per orbit. TV, weather and communications satellites use it so dishes on the ground can point at one fixed spot.',
    // source: https://www.esa.int/ESA_Multimedia/Images/2020/03/Geostationary_transfer_orbit
  },
  'transfer-orbit': {
    term: 'Transfer orbit',
    short: 'A transfer orbit is an oval path that connects a lower orbit to a higher one.',
    more: 'You burn once to stretch your orbit into an oval that touches the new height, then burn again at the far end to stay there. A geostationary transfer orbit (GTO) reaches from about 200 km up to 35,786 km.',
  },
  hohmann: {
    term: 'Hohmann transfer',
    short: 'A Hohmann transfer is the classic two-burn way to move between two round orbits using little fuel.',
    more: 'It is named after the German engineer Walter Hohmann, who described it in 1925. Going from low Earth orbit to GEO this way takes about 5 hours of coasting between the two burns.',
  },
  loi: {
    term: 'Lunar orbit insertion',
    short: 'Lunar orbit insertion is the braking burn that lets the Moon catch a spacecraft into orbit.',
    more: 'Without it, the spacecraft would whip past the Moon and fly away. Braking into a 100 km circular orbit costs about 8 to 9 units.',
    // source: https://descanso.jpl.nasa.gov/monograph/series12/LunarTraj--05Chapter4TransferstoLowLunarOrbits.pdf
  },
  llo: {
    term: 'Low lunar orbit (LLO)',
    short: 'Low lunar orbit is a circle close to the Moon, around 100 km above the gray surface.',
    more: 'One lap takes about 2 hours. The Moon has lumpy patches of heavy rock (called mascons) that tug on low orbits, so most of them slowly drift unless the spacecraft fires small correction burns.',
  },
  'free-return': {
    term: 'Free-return trajectory',
    short: 'A free-return path loops around the Moon and falls back to Earth on its own, with no extra burn needed.',
    more: 'It is a safety path: if the engine fails after TLI, the crew still comes home. Apollo 13 used one after its oxygen tank exploded in 1970, and Artemis II flew one in 2026.',
    // source: https://en.wikipedia.org/wiki/Apollo_13
  },
  flyby: {
    term: 'Flyby',
    short: 'A flyby means passing close to a moon or planet without stopping or landing.',
    more: 'It is cheaper than going into orbit because you never brake. The spacecraft gets a close look, then keeps going on a path bent by the moon\'s gravity.',
  },
  'gravity-assist': {
    term: 'Gravity assist',
    short: 'A gravity assist uses a moon or planet\'s pull to bend your path and change your speed without using fuel.',
    more: 'Because the moon or planet is itself moving, you can leave faster or slower than you arrived, like a ball bouncing off a moving bat. Artemis I used a close lunar flyby, about 130 km above the surface, to help reach its distant orbit.',
    // source: https://en.wikipedia.org/wiki/Artemis_I
  },
  'lagrange-point': {
    term: 'Lagrange point',
    short: 'A Lagrange point is a special balance spot where the pulls of Earth and the Moon and the motion of going around work out evenly.',
    more: 'There are five, named L1 to L5, after the mathematician Joseph-Louis Lagrange. A spacecraft there keeps the same position compared with Earth and the Moon.',
  },
  l1: {
    term: 'L1',
    short: 'L1 is the balance point between Earth and the Moon.',
    more: 'It sits about 59,000 km from the Moon on the Earth side. It is unstable, like a ball balanced on a hilltop, so spacecraft there need small nudges to stay.',
  },
  l2: {
    term: 'L2',
    short: 'L2 is the balance point just behind the Moon, on the side facing away from Earth.',
    more: 'It is about 65,000 km beyond the Moon. A spacecraft looping around L2 can see the Moon\'s far side and Earth at the same time, which makes it great for radio relays.',
  },
  'l4-l5': {
    term: 'L4 and L5',
    short: 'L4 and L5 are balance points along the Moon\'s orbit, one 60° ahead of the Moon and one 60° behind.',
    more: 'Each one makes an equal-sided triangle with Earth and the Moon. Unlike L1 and L2 they are stable, like a marble in a bowl, so something parked there tends to stay.',
  },
  'halo-orbit': {
    term: 'Halo orbit',
    short: 'A halo orbit is a loop around a Lagrange point that looks like a ring, or halo, when seen from Earth.',
    more: 'It loops around an empty spot in space, held in shape by Earth\'s and the Moon\'s gravity together. China\'s Queqiao relay used an L2 halo orbit in 2018 to pass messages from the far side of the Moon.',
    // source: https://en.wikipedia.org/wiki/Queqiao-1
  },
  nrho: {
    term: 'NRHO',
    short: 'NRHO is short for "near-rectilinear halo orbit". It is a long, skinny loop. It swoops low over one of the Moon\'s poles and far out over the other.',
    more: '"Rectilinear" means almost a straight line. One lap takes about 6.5 days and it barely needs fuel to keep. CAPSTONE has flown in one since 2022.',
    // source: https://www.nasa.gov/technology/space-comms/nasas-capstone-completes-extended-mission-testing-lunar-technologies/
  },
  dro: {
    term: 'DRO',
    short: 'DRO stands for distant retrograde orbit, a big wide circle around the Moon that goes the opposite way to the Moon\'s travel.',
    more: '"Retrograde" means backward. DROs are so stable that a spacecraft could stay for years with almost no fuel. Orion flew in one on Artemis I in 2022, about 43,000 miles beyond the Moon.',
    // source: https://www.nasa.gov/mission/artemis-i/
  },
  'three-body-problem': {
    term: 'Three-body problem',
    short: 'The three-body problem is the puzzle of how something moves when two big bodies, like Earth and the Moon, pull on it at once.',
    more: 'With one planet, orbits are neat ovals. With two pulling together, there is no simple formula, and paths can make loops, figure eights and halos. This app computes them step by step.',
  },
  'rotating-frame': {
    term: 'Rotating frame',
    short: 'The rotating frame is a view that turns along with the Moon, so Earth and the Moon always stay in the same place on screen.',
    more: 'It is like watching from a merry-go-round. Orbits near the Moon look like neat closed loops this way; seen from a fixed view, the same orbit looks like a spirograph drawing.',
  },
  'reentry': {
    term: 'Re-entry',
    short: 'Re-entry is when a spacecraft dives back into Earth\'s air and the air slows it down.',
    more: 'Coming home from the Moon, Orion hits the air at about 25,000 mph (11 km/s). Air friction and squeezed air turn that speed into heat, which saves the fuel you would need to brake.',
    // source: https://www.nasa.gov/image-article/orions-successful-splashdown-paves-way-artemis-future/
  },
  'heat-shield': {
    term: 'Heat shield',
    short: 'A heat shield is the thick protective layer on the bottom of a capsule that keeps the crew safe from re-entry heat.',
    more: 'Orion\'s heat shield faces temperatures near 5,000 °F (about 2,760 °C). Its surface is made to char and wear away slowly, carrying heat off with it.',
    // source: https://www.nasa.gov/image-article/orions-successful-splashdown-paves-way-artemis-future/
  },
  splashdown: {
    term: 'Splashdown',
    short: 'Splashdown is when a capsule lands in the ocean under its parachutes.',
    more: 'Water cushions the landing, and ships wait nearby to pick up the crew. Artemis I splashed down in the Pacific Ocean on 11 December 2022.',
    // source: https://www.nasa.gov/mission/artemis-i/
  },
  descent: {
    term: 'Descent',
    short: 'Descent is the trip down from orbit to the ground, with the engine slowing the lander the whole way.',
    more: 'In low lunar orbit you move about 1.6 km/s sideways. A lander must cancel nearly all of that and fight gravity as it drops, so descent costs about 19 units.',
    // source: https://www.lpi.usra.edu/meetings/leag2012/presentations/Connolly.pdf
  },
  landing: {
    term: 'Landing',
    short: 'Landing is touching down gently on the surface, slow enough that nothing breaks.',
    more: 'On the Moon the last few meters happen at walking speed or slower. Pilots and computers pick a flat spot free of big rocks and craters.',
  },
  'moon-phase': {
    term: 'Moon phase',
    short: 'The Moon\'s phase is how much of its sunlit half we can see from Earth, from new Moon to full Moon and back.',
    more: 'The cycle takes about 29.5 days. The phase tells you where on the Moon it is day or night: at new Moon the near side is dark, at full Moon it is noon in the middle of the near side.',
  },
  'lunar-sunrise': {
    term: 'Sunrise on the Moon',
    short: 'The Moon turns slowly. A sunrise there comes only once every 29.5 Earth days. Daytime on the Moon lasts about two Earth weeks.',
    more: 'Apollo crews landed in the lunar morning, with the Sun low (planners allowed 6° to 16° above the horizon). Low sunlight makes long shadows that show rocks and craters clearly, and the ground is not too hot yet.',
    // source: https://honeysucklecreek.net/msfn_missions/Apollo_11_mission/hl_apollo11.html
  },
  'launch-window': {
    term: 'Launch window',
    short: 'A launch window is the stretch of time when a rocket can launch and still reach its target.',
    more: 'Earth spins and the Moon moves, so the target is only lined up for a while. For the Moon, good windows come in groups of days each month, and on each day the window may last only minutes to a couple of hours.',
  },
  'range-safety': {
    term: 'Range safety',
    short: 'Range safety means rockets fly over ocean or empty land, never over towns, in case something goes wrong.',
    more: 'That limits the directions each site can launch. Vandenberg in California launches south over the Pacific for polar orbits, while Cape Canaveral launches east over the Atlantic.',
    // source: https://orbitalradar.com/spaceports/vandenberg
  },
  'rocket-stage': {
    term: 'Rocket stage',
    short: 'A rocket stage is one section of a rocket with its own engines and fuel tanks, dropped when its fuel runs out.',
    more: 'Dropping empty tanks means the rest of the rocket has less weight to push. The Saturn V that flew Apollo had three stages; its third stage did the TLI burn.',
  },
  payload: {
    term: 'Payload',
    short: 'The payload is the useful thing a rocket carries, like a satellite, a capsule or a crew.',
    more: 'Most of a rocket is fuel: often around 90% of its launch weight. The payload is usually only a few percent.',
  },
  'polar-orbit': {
    term: 'Polar orbit',
    short: 'An orbit that passes over the north and south poles on every lap.',
    more: 'The orbit stays lined up with the same stars while the Moon slowly turns underneath it, once every 27.3 days. So a spacecraft in a polar orbit eventually passes over every spot on the Moon. NASA\'s Lunar Reconnaissance Orbiter has mapped the Moon from a polar orbit since 2009.',
  },
  'south-pole': {
    term: 'Lunar south pole',
    short: 'The bottom of the Moon, where the Sun always sits near the horizon.',
    more: 'The Moon\'s axis is tilted only 1.5°, so at the poles the Sun just skims the horizon. Some crater floors never see sunlight and are colder than −200 °C. Ice is trapped there, and astronauts could one day turn it into water, air and rocket fuel. That is why NASA and China both picked the south pole for their next landings.',
  },
  'permanently-shadowed-region': {
    term: 'Permanently shadowed region',
    short: 'A crater floor near the pole where sunlight never reaches.',
    more: 'Because the Sun stays so low, the rims of some polar craters shade their floors forever. These cold traps can hold ice for billions of years.',
  },
  'far-side': {
    term: 'Far side of the Moon',
    short: 'The half of the Moon that always faces away from Earth.',
    more: 'It is not dark: it gets as much sunlight as the near side. But Earth never rises there, so a lander cannot radio home directly. China\'s Chang\'e 4 (2019) and Chang\'e 6 (2024) talked to Earth through the Queqiao relay satellites.',
  },
  'relay-satellite': {
    term: 'Relay satellite',
    short: 'A spacecraft that passes radio messages along when two others can\'t see each other.',
    more: 'China parked Queqiao in a halo orbit around L2, behind the Moon, where it can see both Earth and the far side.',
  },
  libration: {
    term: 'Libration',
    short: 'The Moon\'s slow nodding and wobbling, as seen from Earth.',
    more: 'Because the Moon\'s orbit is tilted and slightly oval, we get to peek a little over its edges. Over time we see about 59% of its surface. Near the south pole, this nodding makes Earth rise and set over the horizon about once a month.',
  },
  'station-keeping': {
    term: 'Station-keeping',
    short: 'Station-keeping means small burns that keep a spacecraft in its chosen orbit.',
    more: 'Unstable orbits, like halos around L1 and L2, need a nudge every week or so. Stable ones, like a DRO, need almost none. NRHO sits in between and needs well under 1 unit per year.',
  },
};

// ---------------------------------------------------------------------------
// 2) Phase captions and "why does this cost fuel?" cards
// ---------------------------------------------------------------------------

export const PHASES: Record<PhaseId, PhaseText> = {
  launch: {
    title: 'Launch',
    caption: 'Liftoff from {site}. The rocket climbs through the air and tips over to build sideways speed.',
    why: 'Reaching orbit is the most expensive part of any trip: about 93 units. Getting high is the easy bit; the hard part is reaching about 78 units of sideways speed so you keep missing Earth as you fall. The rest goes to fighting gravity on the way up and pushing through the air. That is why the rocket\'s big lower stages pay for this part, not your spacecraft\'s tank.',
  },
  parking: {
    title: 'Parking orbit',
    caption: 'In orbit. The spacecraft circles Earth every 90 minutes while the crew checks every system.',
    why: 'Orbiting costs no fuel. Above the thick air, nothing slows you down, so you can keep falling around Earth for free. The only cost is time: you wait until you reach the exact spot in the orbit where the next burn should start.',
  },
  tli: {
    title: 'Trans-lunar injection',
    caption: 'Engine on. A burn of {units} units stretches the orbit out toward the Moon.',
    why: 'To reach the Moon you have to climb out of most of Earth\'s gravity well, so this burn is big: about 31 units. It is done close to Earth, where the spacecraft is fastest, because extra speed added there raises the far end of the orbit the most. After this one burn, the spacecraft can coast nearly 400,000 km.',
  },
  coast: {
    title: 'Coast',
    caption: 'Engine off. The spacecraft coasts toward {dest}; the trip takes about {days} days.',
    why: 'Coasting is free. There is no air in space, so nothing slows you except gravity, and gravity only trades speed for height. The spacecraft slows down as it climbs away from Earth, then speeds up again as the Moon pulls it in. Small correction burns of a fraction of a unit fix tiny aiming errors.',
  },
  flyby: {
    title: 'Lunar flyby',
    caption: 'Swinging around the far side of the Moon. For a while, the Moon blocks the radio link with Earth.',
    why: 'A flyby costs no fuel. The Moon\'s gravity bends the path around its far side and aims it somewhere new, for example back toward Earth. The Moon is also moving along its own orbit. So a flyby can add or take away speed for free. This is called a gravity assist.',
  },
  loi: {
    title: 'Lunar orbit insertion',
    caption: 'Braking burn behind the Moon: {units} units to let the Moon catch the spacecraft.',
    why: 'You arrive at the Moon too fast for it to hold you, because you fell toward it the whole way in. There is no air to slow you down. The only way to brake is to point the engine forward and fire it. Slowing down costs just as much fuel as speeding up. Reaching a 100 km circular orbit takes about 8 to 9 units.',
  },
  insert: {
    title: 'Orbit insertion',
    caption: 'A short burn of {units} units settles the spacecraft into its new orbit at {dest}.',
    why: 'Orbits far from the Moon, like a DRO, a halo or an NRHO, sit near the edge where Earth\'s and the Moon\'s pulls balance. You only need to nudge your speed a little to match them, often 3 to 6 units. That is why these orbits are so cheap to reach compared with low lunar orbit.',
  },
  wait: {
    title: 'Waiting for the landing site',
    caption: 'Circling the Moon while it slowly turns {site} under your orbit. This takes {wait} days.',
    why: 'An orbit stays lined up with the stars while the Moon turns underneath it, once every 27.3 days. A polar orbit passes over the poles on every lap, but any other place only slides under it twice a month. Waiting costs no fuel, though real crews also need enough food, air and power to wait.',
  },
  descent: {
    title: 'Powered descent',
    caption: 'The lander fires its engine and drops toward the surface, slowing from orbital speed.',
    why: 'Landing on the Moon costs about 19 units. In low lunar orbit you move sideways at about 16 units of speed. On the way down, the engine has to take away all of that speed. It also has to hold the lander up against gravity. The Moon has no air, so parachutes and heat shields can\'t help: every bit of speed has to be removed with the engine.',
  },
  landed: {
    title: 'Landed',
    caption: 'Touchdown near {site}. The engine shuts off and dust settles, with nothing to blow it around.',
    why: 'Standing on the surface costs no fuel. But getting off again does: lifting back into lunar orbit takes about 19 units, almost the same as landing. Planners keep that fuel in reserve before they ever start the descent.',
  },
  gto: {
    title: 'Geostationary transfer orbit',
    caption: 'A burn of {units} units stretches the orbit into a long oval reaching 35,786 km up.',
    why: 'This burn at the low point raises the high point of the orbit all the way to GEO height, for about 24 units. After it, the spacecraft coasts about 5 hours up the oval for free, slowing down as it climbs.',
  },
  geo: {
    title: 'Geostationary orbit',
    caption: 'Circularizing at 35,786 km. The spacecraft now keeps pace with Earth\'s spin over the equator.',
    why: 'At the top of the oval you are moving too slowly to stay that high, so a second burn adds speed to make the orbit round. GEO must also lie exactly over the equator, so this burn also removes the orbit\'s tilt. So launch sites far from the equator pay more for this burn. It costs about 15 units from the equator, but about 18 from Florida.',
  },
  return: {
    title: 'Heading home',
    caption: 'Leaving {dest} and falling back toward Earth, about {days} days away.',
    why: 'To come home you need just enough of a push to leave your orbit and fall toward Earth. From low lunar orbit that is about 9 units or more; from distant orbits like a DRO it is less, about 4. On the way down Earth\'s gravity speeds you up again for free.',
  },
  splashdown: {
    title: 'Re-entry and splashdown',
    caption: 'The capsule hits the air at about 11 km/s, glows behind its heat shield, then drifts down under parachutes.',
    why: 'Here Earth\'s air does the braking for free. Slowing from about 11 km/s with an engine would cost over 100 units. Instead, the heat shield handles the heat from squeezing the air, and parachutes do the last part.',
  },
  arrived: {
    title: 'Arrived',
    caption: 'Welcome to {dest}. Trip total: {units} units over {days} days.',
    why: 'Once in place, staying costs little or nothing. Stable orbits, like a DRO or a loop around L4, need almost no fuel. Orbits near L1 and L2 are wobbly. They need small station-keeping pushes to stay in place, often just a few meters per second each time.',
  },
};

// ---------------------------------------------------------------------------
// 3) Destinations
// ---------------------------------------------------------------------------

export const DESTINATIONS: Record<DestId, Destination> = {
  leo: {
    name: 'Low Earth orbit',
    glyph: 'g-leo',
    tagline: 'The first step to everywhere',
    story: 'Low Earth orbit is where the space station, Hubble and most satellites live, a few hundred kilometers up. Every trip in this app starts here. Once you are in orbit, you are about halfway to anywhere in the solar system in terms of fuel.',
    real_missions: [
      'Vostok 1: Yuri Gagarin, the first person in orbit (1961)', // source: https://en.wikipedia.org/wiki/Vostok_1
      'International Space Station: crewed nonstop since 2000', // source: https://en.wikipedia.org/wiki/International_Space_Station
    ],
  },
  geo: {
    name: 'Geostationary orbit',
    glyph: 'g-geo',
    tagline: 'Hang still above one spot on Earth',
    story: 'Up at 35,786 km, a satellite takes exactly one day to go around, so it seems to hover over one spot on the equator. That is perfect for TV, weather pictures and communications. It\'s a popular address, so the space there is carefully shared.',
    real_missions: [
      'Syncom 3: first satellite in geostationary orbit, broadcast the Tokyo Olympics (1964)', // source: https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1964-047A
      'GOES-16 weather satellite (2016)', // source: https://en.wikipedia.org/wiki/GOES-16
    ],
  },
  flyby: {
    name: 'Lunar flyby',
    glyph: 'g-flyby',
    tagline: 'Around the Moon and home, no braking needed',
    story: 'One burn sends you around the far side of the Moon, and the Moon\'s gravity bends your path back home. It is the safest first trip, because if the engine stopped working, you would still come back. Artemis II flew this way in 2026 and set a new distance record for people.',
    real_missions: [
      'Apollo 13: used a free return to get home safely after an explosion (1970)', // source: https://en.wikipedia.org/wiki/Apollo_13
      'Artemis II: four astronauts around the Moon, a record 252,756 miles from Earth (2026)', // source: https://www.nasa.gov/news-release/nasa-welcomes-record-setting-artemis-ii-moonfarers-back-to-earth/
    ],
  },
  llo: {
    name: 'Low lunar orbit',
    glyph: 'g-llo',
    tagline: 'Skim 100 km above the craters',
    story: 'Low lunar orbit is the classic place to map the Moon and to start a landing. You circle the Moon about every 2 hours, close enough to photograph single boulders. Getting here costs more than reaching the distant orbits, because you have to brake deep into the Moon\'s gravity.',
    real_missions: [
      'Apollo 8: first people to orbit the Moon, 10 times (1968)', // source: https://en.wikipedia.org/wiki/Apollo_8
      'Lunar Reconnaissance Orbiter: mapping from about 50 km up (2009)', // source: https://science.nasa.gov/mission/lro/about/
    ],
  },
  surface: {
    name: 'Land on the Moon',
    glyph: 'g-surface',
    tagline: 'Apollo sites, the far side, or the south pole',
    story: 'Pick a landing site. You can land where Apollo astronauts walked, where robots from China, India and Japan touched down, or at a south-pole zone picked for the next crews. Landing is the most expensive trip here, because you must brake into orbit and then brake all the way down with the engine. To reach a site near the Moon\'s equator, you circle above the equator. For anywhere else you need a polar orbit, and you have to wait for the site to turn under you.',
    real_missions: [
      'Apollo 11: first people on the Moon (1969)', // source: https://www.planetary.org/space-missions/apollo-11
      "Chang'e 4: first landing on the Moon's far side (2019)", // source: https://en.wikipedia.org/wiki/Queqiao-1
      'Chandrayaan-3: first landing near the lunar south pole (2023)', // source: https://en.wikipedia.org/wiki/Chandrayaan-3
    ],
  },
  nrho: {
    name: 'Near-rectilinear halo orbit',
    glyph: 'g-nrho',
    tagline: 'A long, skinny loop over the Moon\'s poles',
    story: 'This loop swoops about 3,000 km over one lunar pole, then swings 70,000 km out over the other, once every 6.5 days. It is cheap to reach and always in view of Earth. NASA planned to build its Gateway station here. In 2026 NASA paused Gateway. Today the small CAPSTONE spacecraft flies here.',
    real_missions: [
      'CAPSTONE: first spacecraft in an NRHO (2022), still flying commercially in 2026', // source: https://www.nasa.gov/technology/space-comms/nasas-capstone-completes-extended-mission-testing-lunar-technologies/
    ],
  },
  dro: {
    name: 'Distant retrograde orbit',
    glyph: 'g-dro',
    tagline: 'The calmest parking spot around the Moon',
    story: 'A DRO is a huge, slow circle around the Moon, going the opposite way from the Moon\'s travel. It is so stable that a spacecraft can stay for years with almost no fuel, which makes it a good place to park fuel depots or test new spacecraft. Orion flew here, uncrewed, on Artemis I.',
    real_missions: [
      'Artemis I: Orion, uncrewed, 268,563 miles from Earth (2022)', // source: https://www.nasa.gov/mission/artemis-i/
      "Chang'e 5 orbiter (2022) and China's DRO-A and DRO-B (2024)", // source: https://english.cas.cn/newsroom/cas-in-media/202603/t20260326_1153818.shtml
    ],
  },
  l1halo: {
    name: 'L1 halo orbit',
    glyph: 'g-l1',
    tagline: 'Balance between Earth and the Moon',
    story: 'L1 is the balance point between Earth and the Moon, about 59,000 km from the Moon. A spacecraft looping around it can watch traffic heading to the Moon and see Earth at the same time. The balance is wobbly, so it needs small nudges every so often to stay.',
    real_missions: [
      'ARTEMIS P1 and P2: two NASA probes that looped around L1 and L2 (2010-2011)', // source: https://artemis.igpp.ucla.edu/orbits.shtml
    ],
  },
  l2halo: {
    name: 'L2 halo orbit',
    glyph: 'g-l2',
    tagline: 'A relay for the Moon\'s far side',
    story: 'From Earth we never see the Moon\'s far side, so a lander there can\'t radio home directly. A spacecraft circling L2, behind the Moon, can see both the far side and Earth, and pass messages along. That is exactly how China talked to its first far-side lander.',
    real_missions: [
      "Queqiao: relay for the Chang'e 4 far-side lander (2018)", // source: https://en.wikipedia.org/wiki/Queqiao-1
      'ARTEMIS P1 and P2: looping orbits around L2 (2010-2011)', // source: https://artemis.igpp.ucla.edu/orbits.shtml
    ],
  },
  l4: {
    name: 'Loop around L4',
    glyph: 'g-l4',
    tagline: 'A stable spot 60° ahead of the Moon',
    story: 'L4 sits on the Moon\'s orbit, 60° ahead of it, as far from Earth as the Moon is. It is a natural "bowl" where things tend to stay, so people have suggested it for future space stations and settlements. No spacecraft has parked there yet; you would be among the first.',
    real_missions: [
      "Hiten (Japan): looped through the L4 and L5 regions to look for trapped dust (1991)", // source: https://science.nasa.gov/mission/hiten-hagoromo/
    ],
  },
};

// ---------------------------------------------------------------------------
// 4) Launch-site lessons (shown next to the site picker)
// ---------------------------------------------------------------------------

export const SITE_LESSON: {
  spin: string;
  latitude: string;
  range: string;
  moonDecl: string;
} = {
  spin:
    'Earth spins toward the east, carrying the launch pad with it. If you launch east, you keep that speed for free. You get about 4.6 units at the equator and 4.1 at Cape Canaveral. The farther north or south you go, the less you get.',
  // source: https://orbitalradar.com/blog/why-do-rockets-launch-from-florida
  latitude:
    'A rocket\'s orbit always circles Earth\'s center, so it is tilted at least as much as your launch site\'s latitude. From Florida (28.5° N) you start tilted 28.5°. Reaching GEO, which has no tilt at all, means paying a few extra units to straighten the orbit out.',
  range:
    'Rockets must not fly over towns in case something goes wrong, so each site can only launch in certain directions. Cape Canaveral launches east, over the Atlantic Ocean. Vandenberg, in California, launches south over the Pacific. From there, rockets go into orbits that pass over the poles.',
  // source: https://orbitalradar.com/spaceports/vandenberg
  moonDecl:
    'The Moon\'s orbit is tilted. Every 27 days or so, the Moon swings from about 28.5° north of the equator in our sky to about 28.5° south and back again. Your path to the Moon has to line up with where the Moon will be when you arrive. On some dates that fits your launch site well; on others, the trip costs a little extra fuel or you wait a few days.',
};

// ---------------------------------------------------------------------------
// 5) Challenges (easy -> hard)
// Budgets (maxUnits) are TUNABLE: they are set from transfers.json ranges
// (1 unit = 0.1 km/s) plus a little slack. Re-tune once the planner's own
// numbers for each site and date are final.
// ---------------------------------------------------------------------------

export const CHALLENGES: Challenge[] = [
  {
    id: 'first-orbit',
    title: 'First orbit',
    brief: 'Launch from any site and reach low Earth orbit, just like Yuri Gagarin did in 1961.',
    constraints: { dest: 'leo' },
    success: 'You are in orbit, falling around Earth every 90 minutes. Notice your tank is still full: the rocket\'s lower stages paid for the climb.',
    hint: 'Pick any site and press Launch. Watch how the rocket tips over sideways: speed, not height, is the real goal.',
  },
  {
    id: 'artemis-ii',
    title: 'Around the Moon like Artemis II',
    brief: 'Fly around the far side of the Moon and come home, using no fuel after the TLI burn.',
    constraints: { dest: 'flyby', maxUnits: 33 }, // TLI ~31 + small corrections; tunable
    success: 'Home again. The Moon\'s gravity turned you around for free, the same way it brought Artemis II home in 2026.',
    hint: 'A free return needs no braking at the Moon. If your total goes above about 31 units, check that you are not adding an orbit insertion.',
  },
  {
    id: 'geo-two-sites',
    title: 'GEO from two sites',
    brief: 'Reach geostationary orbit twice: once from a site near the equator and once from a site far from it. Compare the fuel.',
    constraints: { dest: 'geo', compareSites: true },
    success: 'The site farther from the equator needed more fuel, because its orbit started out more tilted and had to be straightened at GEO.',
    hint: 'Look at the GEO burn, not the GTO burn. The difference comes from removing the orbit\'s tilt.',
  },
  {
    id: 'artemis-i-dro',
    title: 'Park in the DRO like Artemis I',
    brief: 'Send your spacecraft into the distant retrograde orbit around the Moon, where Orion flew in 2022.',
    constraints: { dest: 'dro', maxUnits: 39 }, // planner's direct route: TLI ~31.5 + insertion ~6.1 (CR3BP); tunable
    success: 'Parked. A DRO is so stable you could stay a long time with almost no fuel. The real Orion swung close past the Moon on the way, so it used only about 3 units to arrive. This planner flies a simpler, direct path. Yours cost about twice as much.',
    hint: 'Compare it with low lunar orbit: a big, far-out loop needs less braking than a tight orbit close to the Moon.',
  },
  {
    id: 'apollo-8-orbit',
    title: 'Orbit the Moon like Apollo 8',
    brief: 'Brake into a low lunar orbit, about 100 km above the surface.',
    constraints: { dest: 'llo', maxUnits: 42 }, // TLI ~31 + LOI ~8-9; tunable
    success: 'You are in low lunar orbit, circling every 2 hours, like the Apollo 8 crew in 1968.',
    hint: 'Compare this with the DRO challenge. Why does going lower around the Moon cost more braking?',
  },
  {
    id: 'apollo-sunrise',
    title: 'Land at sunrise, like Apollo 11',
    brief: 'Land at the Apollo 11 site while the Sun is low in the lunar morning sky, so long shadows show the rocks.',
    constraints: { dest: 'surface', landingSite: 'apollo-11', requireSunriseLanding: true, maxUnits: 62 }, // TLI ~31 + LOI ~9 + descent ~19; more than the default 45-unit tank; tunable
    success: 'Touchdown in the lunar morning. Low sunlight made every boulder cast a long shadow, just as the Apollo planners wanted.',
    hint: 'Change the launch date, not the site. Sunrise at a spot on the Moon comes only once every 29.5 days, a few days after new Moon for this site.',
  },
  {
    id: 'south-pole',
    title: 'South pole pioneer',
    brief: 'Land at one of the south-pole zones picked for future crews, on a day when the Sun is up and Earth is above the horizon for radio.',
    constraints: { dest: 'surface', landingRegion: 'south-pole', requireLitLanding: true, maxUnits: 62 }, // polar LOI costs about the same as equatorial (CR3BP)
    success: 'You landed where the next astronauts plan to go. The Sun barely clears the horizon here, and Earth bobs up and down as the Moon nods, so landing days have to be picked with care.',
    hint: 'Pick a launch day with a check mark. At the pole, the Sun and Earth each spend about half the month above the horizon, and you need both.',
  },
  {
    id: 'far-side',
    title: 'Land on the far side',
    brief: 'Touch down on the side of the Moon that never faces Earth, like China\'s Chang\'e 4 and Chang\'e 6.',
    constraints: { dest: 'surface', landingRegion: 'far-side', requireLitLanding: true, maxUnits: 62 },
    success: 'Landed on the far side. Earth never rises here, so your lander would talk to home through a relay satellite parked beyond the Moon, like Queqiao.',
    hint: 'Choose a far-side site: Chang\'e 4, Chang\'e 6 or Blue Ghost Mission 2. Then look for a day with a check mark. The far side is sunny around new Moon, when the side facing us is dark.',
  },
  {
    id: 'reach-l4',
    title: 'Visit L4',
    brief: 'Settle into a loop around L4, the stable balance point 60° ahead of the Moon.',
    constraints: { dest: 'l4', maxUnits: 40 }, // estimate: return trip L4->LEO is 36-38 units (Evans AMOS 2024); tunable
    success: 'You made it to L4, a place no spacecraft has parked yet. Things placed here tend to stay.',
    hint: 'L4 moves with the Moon, so you have to aim ahead of where it is now. Try a few different launch dates.',
  },
  {
    id: 'cheapest-geo',
    title: 'Cheapest road to GEO',
    brief: 'Find the launch site that reaches geostationary orbit with the least fuel from your tank.',
    constraints: { dest: 'geo', compareSites: true, maxUnits: 40 }, // LEO->GEO 39-43 units by latitude; tunable
    success: 'Found it. The site closest to the equator wins, because it gets the biggest spin bonus and its orbit needs almost no straightening.',
    hint: 'Look at each site\'s latitude. Which one would leave your orbit with the least tilt?',
  },
];
