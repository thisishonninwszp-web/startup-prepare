"use server";
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import * as commands from '@/lib/domains/experiments/commands';
import { loadExperiments } from '@/lib/domains/experiments/queries';
import type { ExperimentVersionInput, ExperimentCaseInput, StartRunInput, CompleteRunInput, AttachExperimentInput } from '@/lib/domains/experiments/domain';
async function viewer() {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) throw new Error('未登录');
  if (process.env.IDEA_EXPERIMENTS_ENABLED !== 'true') throw new Error('实验功能尚未开启');
  return user.id;
}
async function write<T>(input: T, command: (viewer: string, input: T) => Promise<{ id: string }>) {
  try {
    const result = await command(await viewer(), input);
    revalidatePath('/ideas');
    revalidatePath('/ideas/[id]', 'page');
    revalidatePath('/ideas/[id]/timeline', 'page');
    revalidatePath('/workbench');
    return { ok: true as const, ...result };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : '保存失败' };
  }
}
export async function saveExperimentVersionAction(input: ExperimentVersionInput) { return write(input, commands.saveExperimentVersion); }
export async function appendExperimentCaseAction(input: ExperimentCaseInput) { return write(input, commands.appendExperimentCase); }
export async function startExperimentRunAction(input: StartRunInput) { return write(input, commands.startExperimentRun); }
export async function completeExperimentRunAction(input: CompleteRunInput) { return write(input, commands.completeExperimentRun); }
export async function attachExperimentGapRefAction(input: AttachExperimentInput) { return write(input, commands.attachExperimentGapRef); }
export async function loadExperimentsAction(ideaId: string, offset = 0) {
  try {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) throw new Error('未登录');
    if (process.env.IDEA_EXPERIMENTS_ENABLED !== 'true') return { ok: true as const, data: 'disabled' as const };
    return { ok: true as const, data: await loadExperiments(user.id, ideaId, offset) };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : '读取失败' };
  }
}
