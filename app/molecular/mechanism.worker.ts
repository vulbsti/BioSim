import {runExperiment, type ExperimentConfig} from './experiments';
self.onmessage = (event: MessageEvent<{id: number; config: ExperimentConfig}>) => {
  const {id, config} = event.data;
  try {self.postMessage({id, result: runExperiment(config)});}
  catch (e) {self.postMessage({id, error: e instanceof Error ? e.message : 'Mechanism calculation failed.'});}
};
