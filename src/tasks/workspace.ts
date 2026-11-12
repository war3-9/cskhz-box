import { z } from "zod";
import { projectSchema } from "../project/schema";
import { restoreProject, serializeProject } from "../project/builtinReferences";
import type { ProjectFile } from "../shared/types";
import type { BuiltinLibrary } from "../assets/services/builtin";
import { isTaskDirty, useTasks } from "./store";

const sessionSchema = z
  .object({
    activeId: z.string().nullable(),
    tasks: z.array(
      z.object({
        id: z.string().min(1).max(200),
        document: projectSchema.shape.document,
        dirty: z.boolean(),
      }),
    ),
  })
  .superRefine((session, context) => {
    if (
      new Set(session.tasks.map((task) => task.id)).size !==
      session.tasks.length
    )
      context.addIssue({ code: "custom", message: "任务 ID 重复" });
    if (
      session.tasks.length
        ? !session.tasks.some((task) => task.id === session.activeId)
        : session.activeId !== null
    )
      context.addIssue({ code: "custom", message: "活动任务无效" });
  });
export const workspaceSchema = z.intersection(
  projectSchema,
  z.object({
    session: sessionSchema.optional(),
  }),
);

export function serializeWorkspace(
  project: ProjectFile,
  builtin: BuiltinLibrary,
) {
  const tasks = useTasks.getState();
  return {
    ...serializeProject(project, builtin),
    session: {
      activeId: tasks.activeId,
      tasks: tasks.tasks.map((task) => ({
        id: task.id,
        dirty: isTaskDirty(task),
        document: serializeProject(
          { ...project, document: task.document },
          builtin,
        ).document,
      })),
    },
  };
}

export function restoreWorkspace(text: string, builtin: BuiltinLibrary) {
  return restoreWorkspaceValue(JSON.parse(text), builtin);
}

function restoreWorkspaceValue(value: unknown, builtin: BuiltinLibrary) {
  const parsed = workspaceSchema.parse(value);
  const project = restoreProject(parsed, builtin);
  const session = parsed.session;
  const entries = session
    ? session.tasks.map((task) => ({
        ...task,
        document: restoreProject(
          { ...parsed, document: task.document },
          builtin,
        ).document,
      }))
    : project.document.canvasCreated === false
      ? []
      : [
          {
            id: crypto.randomUUID(),
            document: project.document,
            dirty: true,
          },
        ];
  // Apply document invariants to inactive tasks as well as the active one.
  entries.forEach((task) =>
    projectSchema.parse({ ...project, document: task.document }),
  );
  return {
    library: project.library,
    entries,
    activeId: session?.activeId ?? entries[0]?.id ?? null,
  };
}
