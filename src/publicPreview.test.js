import { expect, it } from 'vitest';
import { createPublicPreview, previewStages } from './publicPreview';
it.each(previewStages)('creates usable %s preview', (stage) => {
  const state=createPublicPreview(stage);
  expect(state.players.length).toBeGreaterThan(0);
  expect(state.phase).toBe(['finished','final'].includes(stage)?'finished':stage==='registration'?'registration':'playing');
  if(stage.startsWith('round')) expect(state.rounds.at(-1).some(m=>!m.isDone)).toBe(true);
  if(['playoff','final'].includes(stage)) expect(state.playoffSeeds).toHaveLength(8);
});
