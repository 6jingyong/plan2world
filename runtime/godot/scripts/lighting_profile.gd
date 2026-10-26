extends RefCounted

# Shared renderer reference. Native Project lumens/temperature and GLB material
# reflectance remain unchanged; view presets are session state.
const EXPOSURE:=.85
const WHITE_POINT:=6.0
const LUMENS_PER_ENERGY:=800.0
const AMBIENT:=[.30,.025,.14,.12]
const SUN_ENERGY:=[.85,.02,.55,.45]
const SUN_COLOR:=[Color("fff3dc"),Color("7495cd"),Color("ffb16e"),Color("ff8b58")]
const BACKGROUND:=[Color("dce6ee"),Color("101a30"),Color("edc6ab"),Color("c99d9e")]
const ROTATION:=[Vector3(-55,-35,0),Vector3(-40,130,0),Vector3(-12,-85,0),Vector3(-10,85,0)]
