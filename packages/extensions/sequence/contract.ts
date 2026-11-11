export const sequenceTags: Record<string, any> = Object.fromEntries(['sequence-diagram'].map(name => [name, {
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
export const sequenceTargets = {
  'sequence-diagram': ['sequence']
} as const;
export const sequenceResources = {
  'sequences': 'sequence'
} as const;
