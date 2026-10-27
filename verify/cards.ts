/**
 * Gates A1 and A2: cause → visible effect cards.
 * A card is written before the mechanism is built. It says what causes the change, what a person should see,
 * and which screenshots prove it. `pairs` are the rest/change checks: if the two screenshots barely differ,
 * the visual is decoration and the card fails.
 *
 * To add a card: append to `cards` (or import one from your own file). Steps are plain actions on the app,
 * see `Step`. Shots are taken in order; each shot's `after` steps run first, so time adds up down the list.
 */
export type Step =
  | {scenario: 'At rest' | 'After a meal' | 'Exercise & recovery' | 'A big glass of water'}
  | {eat: {carbs: number; protein: number; fat: number}}
  | {water: true}
  | {exercise: number}
  /** Skip ahead in simulated minutes (rounded to 5). */
  | {advance: number}
  | {watch: 'heart' | 'breathing' | 'oxygen' | 'sugar' | 'digestion'}
  /** "Colour by" option, as the user reads it. */
  | {lens: 'Blood flow' | 'Sugar (glucose)' | 'Oxygen' | 'Fat (lipids)' | 'This meal' | 'Hormones' | string}
  /** "What to show" button. */
  | {show: 'Open body' | 'Organs' | 'Muscles' | 'Skeleton' | 'Vessels' | 'Nerves' | 'Surface' | string}
  | {angle: 'Front' | 'Back' | 'Side' | '¾'}
  | {region: 'Whole body' | 'Chest' | 'Belly' | 'Head'}
  /** Find a body part by name and zoom to it. */
  | {find: string}
  | {chart: boolean}
  /** Anatomical motion (heart beat, breathing, beads). Off by default so screenshots repeat. */
  | {motion: boolean}
  /** "Tap below the kneecap" in Try something: the body sits and the knee-jerk reflex plays. */
  | {tap: 'knee'}
  /** Show one step of the knee-jerk reflex (its numbered button), held still. */
  | {reflexStep: 'tap' | 'sensory' | 'cord' | 'motor' | 'kick'};

export type Shot = {label: string; after?: Step[]; note?: string};
export type Pair = {
  rest: string; change: string; what: string;
  /** Picture pair: share of the frame that must change (default 0.4%). Motion pair: how many times faster (default 1.25). */
  min?: number;
  /**
   * Compare a motion instead of pictures: the rate the 3D scene animates at (heart beats, breaths, blood bead speed in the thigh).
   * A still cannot show speed, so motion visuals are checked by what the scene is actually animating.
   */
  motion?: 'heart beats' | 'breaths' | 'thigh blood speed';
};
export type Card = {
  id: string;
  title: string;
  cause: string;
  /** What a person should see, in order, in plain words. */
  expect: string[];
  /** The one-line answer to "what just happened?" (gate A6). */
  answer: string;
  setup?: Step[];
  shots: Shot[];
  pairs?: Pair[];
  /** A card for a mechanism that is not built yet: listed in the report, not run. */
  pending?: string;
};

const meal75 = {carbs: 75, protein: 25, fat: 20};

export const cards: Card[] = [
  {
    id: 'meal-sugar',
    title: 'A meal raises blood sugar, and the liver and muscles take it in',
    cause: 'A 75 g carbohydrate meal at time zero.',
    expect: [
      'Within 15 minutes the gut and the portal vein to the liver tint as sugar arrives.',
      'By 45 minutes the blood and the liver are clearly more sugar-coloured than at rest.',
      'By 2 hours the tint has mostly faded back towards rest.',
      'The blood sugar curve peaks 30 to 60 minutes after the meal and is back near where it started by 2 to 3 hours.',
    ],
    answer: 'Food went in, sugar went up through the gut and liver, then came back down.',
    setup: [{watch: 'sugar'}, {region: 'Belly'}],
    shots: [
      {label: 'Before the meal'},
      {label: '15 min', after: [{eat: meal75}, {advance: 15}]},
      {label: '45 min', after: [{advance: 30}]},
      {label: '2 hours', after: [{advance: 75}]},
      {label: 'Blood sugar over 2 hours', after: [{chart: true}]},
    ],
    pairs: [{rest: 'Before the meal', change: '45 min', what: 'Sugar colour on the gut, liver and blood'}],
  },
  {
    id: 'meal-route',
    title: 'This meal can be followed from the stomach into the body',
    cause: 'A 75 g carbohydrate meal, coloured with the "This meal" lens.',
    expect: ['The stomach holds the meal first.', 'Then the gut and the vein to the liver carry it.', 'Then the liver and muscles hold some of it.'],
    answer: 'The meal moved from the stomach through the gut into the liver and muscles.',
    setup: [{watch: 'digestion'}, {lens: 'This meal'}],
    shots: [
      {label: 'Just eaten', after: [{eat: meal75}]},
      {label: '30 min', after: [{advance: 30}]},
      {label: '2 hours', after: [{advance: 90}]},
    ],
    pairs: [{rest: 'Just eaten', change: '30 min', what: 'Meal colour moving out of the stomach'}],
  },
  {
    id: 'exercise-heart',
    title: 'Exercise speeds the heart and sends blood to the muscles',
    cause: 'Jogging (exercise level 0.6) from time zero.',
    expect: ['Within 5 minutes the vessels to the legs carry more blood than at rest.', 'The heart beats visibly faster and the blood beads move faster.', 'The heart rate in the top bar has gone well up.'],
    answer: 'The person started moving; the heart pumped harder and the legs got more blood.',
    setup: [{watch: 'heart'}],
    shots: [
      {label: 'At rest'},
      {label: 'Jogging 5 min', after: [{exercise: 0.6}, {advance: 5}]},
      {label: 'Jogging 20 min', after: [{advance: 15}]},
    ],
    pairs: [
      {rest: 'At rest', change: 'Jogging 5 min', what: 'Blood flow colour in the legs and trunk'},
      {rest: 'At rest', change: 'Jogging 5 min', what: 'The heart beats faster', motion: 'heart beats'},
      {rest: 'At rest', change: 'Jogging 5 min', what: 'Blood beads in the thigh move faster', motion: 'thigh blood speed'},
    ],
  },
  {
    id: 'water-bladder',
    title: 'A big drink of water ends up in the bladder',
    cause: 'Drinking three glasses of water (750 mL) at time zero.',
    expect: ['After an hour the bladder is visibly fuller than at rest.'],
    answer: 'They drank water; the kidneys made urine and the bladder filled.',
    setup: [{show: 'Organs'}, {region: 'Belly'}, {find: 'Urinary bladder'}],
    shots: [
      {label: 'At rest'},
      {label: '1 hour after drinking', after: [{water: true}, {water: true}, {water: true}, {advance: 60}]},
    ],
    pairs: [{rest: 'At rest', change: '1 hour after drinking', what: 'Bladder size'}],
  },
  {
    id: 'meal-hormones',
    title: 'After a meal the pancreas sends out insulin',
    cause: 'A 75 g carbohydrate meal, coloured with the "Hormones" lens.',
    expect: ['By 30 minutes the pancreas stands out and the muscles and liver that receive insulin are marked.'],
    answer: 'After eating, the pancreas released insulin to the muscles and liver.',
    setup: [{watch: 'digestion'}, {lens: 'Hormones'}],
    shots: [
      {label: 'Before the meal'},
      {label: '30 min', after: [{eat: meal75}, {advance: 30}]},
    ],
    pairs: [{rest: 'Before the meal', change: '30 min', what: 'Hormone colour on the pancreas and its targets'}],
  },
  {
    id: 'knee-jerk',
    title: 'A tap below the kneecap: a signal goes to the spinal cord and straight back, and the leg kicks',
    cause: 'A tap on the tendon below the right kneecap, with the body sitting and the lower legs hanging.',
    expect: [
      'A light-blue signal leaves the front of the thigh and runs up the femoral nerve, through the groin, into the spinal cord in the lower back.',
      'An orange command comes back out of the cord and down the same nerve into the front of the thigh; a violet one runs down the back of the thigh.',
      'The front of the thigh turns warm (tightening), the back of the thigh turns cool (relaxing), and the lower leg swings forward.',
      'Every nerve the signal uses sits inside the body: in the spine, behind the hip muscles, between the thigh muscles.',
    ],
    answer: 'The tap sent a signal up a nerve to the spinal cord and straight back, and the thigh muscle kicked the leg.',
    setup: [{tap: 'knee'}],
    shots: [
      {label: 'Sitting, tapped', after: [{reflexStep: 'tap'}]},
      {label: 'Signal going up', after: [{reflexStep: 'sensory'}]},
      {label: 'Command coming back', after: [{reflexStep: 'motor'}]},
      {label: 'Kick', after: [{reflexStep: 'kick'}]},
    ],
    pairs: [
      {rest: 'Sitting, tapped', change: 'Signal going up', what: 'The sensing signal on the femoral nerve'},
      {rest: 'Sitting, tapped', change: 'Kick', what: 'The lower leg swings forward; thigh muscles change colour'},
    ],
  },
  {
    id: 'nerves-inside',
    title: 'The spinal cord and the nerves sit inside the body',
    cause: 'The "Nerves" view: brain, spinal cord and body nerves inside a faint skin and skeleton.',
    expect: ['From every side the cord runs down the spinal canal and the nerves run inside the limbs and trunk; nothing pokes out of the skin.'],
    answer: 'The brain, spinal cord and nerves, all inside the body.',
    setup: [{show: 'Nerves'}],
    shots: [
      {label: 'Front', after: [{angle: 'Front'}]},
      {label: 'Back', after: [{angle: 'Back'}]},
      {label: 'Side', after: [{angle: 'Side'}]},
      {label: '¾', after: [{angle: '¾'}]},
    ],
  },
  {
    id: 'insulin-particles',
    title: 'Insulin particles stream from the pancreas to the muscles',
    cause: 'A 75 g carbohydrate meal.',
    expect: ['The pancreas pulses within 5 minutes of sugar rising.', 'Gold particles leave it into the blood and the muscles light up when they arrive.'],
    answer: 'The pancreas released insulin that travelled in the blood to the muscles.',
    shots: [],
    pending: 'Plan step 2 (hormones as particles). Write the shots when the particles exist.',
  },
];
