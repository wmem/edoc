export const binaryLayoutTags: Record<string, any> = Object.fromEntries(['binary-diagram', 'binary-field-table'].map(name => [name, {
  render: 'div',
  selfClosing: true,
  attributes: {
    id: {
      type: String,
      required: true
    },
    view: {
      type: String
    }
  }
}]));
export const binaryLayoutTargets = {
  'binary-diagram': ['binary-layout'],
  'binary-field-table': ['binary-layout']
} as const;
export const binaryLayoutResources = {
  'binaryLayouts': 'binary-layout'
} as const;
