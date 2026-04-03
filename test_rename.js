const { spawnSync } = require('child_process');

const proc = spawnSync('npx', ['tsx', 'src/index.ts', 'rename', './testphotos', '--quick'], {
  input: 'n\n', 
  encoding: 'utf-8',
  cwd: __dirname
});

console.log('STDOUT:\n', proc.stdout);
console.log('STDERR:\n', proc.stderr);
