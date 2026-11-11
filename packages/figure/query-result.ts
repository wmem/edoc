// 局部元素查询的共用返回外壳；领域载荷由各扩展维护。
export type EngineeringResult = {
  irVersion: string;
  projectId: string;
  modelId: string;
  target: {
    id: string;
    label?: string;
    location: {
      file: string;
      path: string;
    };
    [key: string]: unknown;
  };
  incoming: never[];
  outgoing: never[];
  [key: string]: unknown;
};
