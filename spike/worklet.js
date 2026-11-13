import { Mixer } from './kernel.js';

// Wraps the kernel for the A/B page. The voices are built from options so the page and the
// processor agree on exactly what plays.
class MixerProcessor extends AudioWorkletProcessor {
  constructor({ processorOptions: { data, voices } }) {
    super();
    this.mixer = new Mixer(voices.length);
    for (const o of voices) this.mixer.add(data, o);
  }
  process(_in, out) {
    this.mixer.render(out[0][0], out[0][1], out[0][0].length);
    return true;
  }
}
registerProcessor('mixer', MixerProcessor);
