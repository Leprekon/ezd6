export type ResourceChangePayload = {
    actor: any;
    actorId: string;
    resourceKey: string;
    resourceId: string;
    resourceName: string;
    resourceIcon: string;
    delta: number;
    previousValue: number;
    currentValue: number;
    maxValue: number;
};

export type ResourceChangeRow = {
    resourceKey: string;
    resourceId: string;
    resourceName: string;
    resourceIcon: string;
    oldValue: number;
    newValue: number;
    maxValue: number;
};

export type ResourceChangeFlag = {
    actorId: string;
    rows: Record<string, ResourceChangeRow>;
    order: string[];
};

export type PendingBatch = {
    actor: any;
    actorId: string;
    changes: Map<string, ResourceChangeRow>;
    order: string[];
    timer: number | null;
};
