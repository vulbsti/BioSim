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
  /** In the Hormones lens, follow one hormone (its model id, such as 'insulin'), or 'all'. */
  | {hormone: string}
  /** "What to show" button. */
  | {show: 'Open body' | 'Organs' | 'Muscles' | 'Skeleton' | 'Vessels' | 'Nerves' | 'Surface' | string}
  | {angle: 'Front' | 'Back' | 'Side' | '¾'}
  | {region: 'Whole body' | 'Chest' | 'Belly' | 'Head'}
  /** Find a body part by name and zoom to it. */
  | {find: string}
  | {chart: boolean}
  /** Anatomical motion (heart beat, breathing, beads). Off by default so screenshots repeat. */
  | {motion: boolean};

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
    id: 'insulin-particles',
    title: 'Insulin particles stream from the pancreas to the muscles',
    cause: 'A 75 g carbohydrate meal, following insulin in the Hormones lens.',
    expect: [
      'Before the meal a few gold dots ride the blood, more in the portal vein to the liver than elsewhere.',
      'By 20 minutes the pancreas is gold and gold dots crowd the portal vein; the liver and the muscles are lit gold.',
      'By 3 hours the dots have thinned and the liver and muscles are plain again.',
    ],
    answer: 'The pancreas released insulin that travelled in the blood to the liver and muscles, then it faded.',
    setup: [{show: 'Organs'}, {region: 'Belly'}, {lens: 'Hormones'}, {hormone: 'insulin'}],
    shots: [
      {label: 'Before the meal'},
      {label: '20 min', after: [{eat: meal75}, {advance: 20}]},
      {label: '3 hours', after: [{advance: 160}]},
    ],
    pairs: [{rest: 'Before the meal', change: '20 min', what: 'Gold insulin dots and gold liver and muscles'}],
  },
  {
    id: 'exercise-adrenaline',
    title: 'Exercise sends adrenaline from the adrenal glands to the heart',
    cause: 'Jogging (exercise level 0.6), following adrenaline in the Hormones lens.',
    expect: ['Within 5 minutes orange dots leave the veins beside the kidneys, where the adrenal glands sit.', 'The heart and liver are lit orange.'],
    answer: 'Moving made the adrenal glands release adrenaline, which reached the heart and liver.',
    setup: [{show: 'Organs'}, {region: 'Whole body'}, {lens: 'Hormones'}, {hormone: 'epinephrine'}],
    shots: [
      {label: 'At rest'},
      {label: 'Jogging 5 min', after: [{exercise: 0.6}, {advance: 5}]},
    ],
    pairs: [{rest: 'At rest', change: 'Jogging 5 min', what: 'Orange adrenaline dots and a lit heart and liver'}],
  },
];
