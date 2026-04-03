import OpenAI from 'openai';
import fs from 'fs';

async function test() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error('Set OPENAI_API_KEY in the environment.');
    process.exit(1);
  }
  const openai = new OpenAI({ apiKey: key });
  const models = await openai.models.list();
  fs.writeFileSync('openai_models.json', JSON.stringify(models.data, null, 2));
}

test();
