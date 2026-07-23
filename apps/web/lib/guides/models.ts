export interface GuideProgressView {
  readonly currentStep: number;
  readonly guideKey: string;
  readonly guideVersion: number;
  readonly id: string;
  readonly status: "not_started" | "in_progress" | "completed" | "dismissed";
}

export interface GettingStartedSnapshot {
  readonly checklist: readonly {
    readonly completed: boolean;
    readonly description: string;
    readonly href: string;
    readonly label: string;
  }[];
  readonly completedCount: number;
  readonly progress: readonly GuideProgressView[];
  readonly recommendation: { readonly body: string; readonly href: string; readonly label: string };
  readonly totalCount: number;
}
