import { runPixelphotoTui } from './index.js';

runPixelphotoTui().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
