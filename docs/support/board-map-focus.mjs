// 从完整两板图选择顶板范围，复用原节点、端口和约束，不维护第二份器件定义。
export function topBoardView(view) {
  const drawing = view.drawing;
  const nodes = drawing.nodes.filter(node => node.id === 'top' || node.parentId === 'top');
  const ids = new Set(nodes.map(node => node.id));
  const connections = drawing.connections.filter(connection => connection.ends.every(end => ids.has(end.node)));
  const connectionIds = new Set(connections.map(connection => connection.id));
  const constraints = drawing.layout.constraints.filter(constraint =>
    (!constraint.node || ids.has(constraint.node)) &&
    (!constraint.connection || connectionIds.has(constraint.connection)));
  return {
    ...view,
    id: 'manual:drawing-top-board',
    label: '顶板局部：不含板间连接',
    drawing: {...drawing, id: 'top-board-detail', nodes, connections, layout: {...drawing.layout, constraints}}
  };
}
