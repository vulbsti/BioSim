import type {BodyState} from './types';

/** A committed worker snapshot and its existing controls; observers own no solver state. */
export type BodyRunObservation={
  state:BodyState;
  running:boolean;
  send:(message:{type:'run';running:boolean}|{type:'export'})=>void;
};
