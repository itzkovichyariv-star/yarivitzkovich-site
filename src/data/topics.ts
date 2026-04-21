export const TOPICS = [
  { id: 'incivility', label: 'Incivility', color: '#7A1E2B', description: 'Low-intensity workplace mistreatment.' },
  { id: 'bystander', label: 'Bystander', color: '#5B4E8A', description: 'Bystander behavior in mistreatment episodes.' },
  { id: 'ai', label: 'AI', color: '#2D5F5D', description: 'Artificial intelligence in organizational settings.' },
  { id: 'abusive-supervision', label: 'Abusive Supervision', color: '#B8570C', description: '' },
  { id: 'bullying', label: 'Bullying', color: '#7A1E2B', description: '' },
  { id: 'lmx', label: 'LMX', color: '#5B4E8A', description: 'Leader\u2013member exchange.' },
  { id: 'wellbeing', label: 'Wellbeing', color: '#2D5F5D', description: '' },
  { id: 'hierarchies', label: 'Hierarchies', color: '#B8570C', description: '' },
  { id: 'editorial', label: 'Editorial', color: '#444', description: '' },
] as const;

export type TopicId = typeof TOPICS[number]['id'];
export const TOPIC_IDS = TOPICS.map((t) => t.id) as readonly TopicId[];
