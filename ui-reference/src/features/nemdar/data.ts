import perfume from '@/assets/campaign-perfume.svg';
import shoes from '@/assets/campaign-shoes.svg';
import headphones from '@/assets/campaign-headphones.svg';

export type ProjectStatus = 'Draft' | 'Review' | 'Approved' | 'Rendering' | 'Published';
export type Project = { id: string; name: string; type: string; ratio: string; language: string; status: ProjectStatus; updated: string; owner: string; approval: string; image: string; progress: number };
export const projects: Project[] = [
  { id: 'p1', name: 'The Art of Presence', type: 'Campaign video', ratio: '16:9', language: 'EN + AR', status: 'Review', updated: '2 hours ago', owner: 'Demo team', approval: '2 of 3 approved', image: perfume, progress: 72 },
  { id: 'p2', name: 'Move Your Way', type: 'Social campaign', ratio: '9:16', language: 'EN', status: 'Rendering', updated: 'Yesterday', owner: 'Demo team', approval: 'Approved', image: shoes, progress: 88 },
  { id: 'p3', name: 'Sound Without Limits', type: 'Product launch', ratio: '1:1', language: 'AR + EN', status: 'Approved', updated: 'Oct 1', owner: 'Demo team', approval: 'Approved', image: headphones, progress: 100 },
  { id: 'p4', name: 'Form & Feeling', type: 'Brand film', ratio: '16:9', language: 'EN', status: 'Draft', updated: 'Sep 29', owner: 'Demo team', approval: 'Not requested', image: perfume, progress: 28 },
];
export type Asset = { id: string; name: string; type: 'Image' | 'Video' | 'Audio'; source: string; provider: string; cost: string; usage: string; image: string; status: string };
export const assets: Asset[] = [
  { id: 'a1', name: 'Presence — hero still', type: 'Image', source: 'Generated', provider: 'Image model A', cost: '$0.18', usage: '2 projects', image: perfume, status: 'Approved' },
  { id: 'a2', name: 'Move — product cut', type: 'Video', source: 'Upload', provider: 'Original', cost: '—', usage: '1 project', image: shoes, status: 'In use' },
  { id: 'a3', name: 'Sound — product still', type: 'Image', source: 'Generated', provider: 'Image model B', cost: '$0.24', usage: '1 project', image: headphones, status: 'Approved' },
];
export type RenderJob = { id: string; name: string; status: 'Rendering' | 'Queued' | 'Complete' | 'Failed'; progress: number; priority: string; attempts: number; worker: string; duration: string };
export const renderJobs: RenderJob[] = [
  { id: 'R-1042', name: 'Move Your Way · TikTok 9:16', status: 'Rendering', progress: 68, priority: 'High', attempts: 1, worker: 'Worker 03', duration: '02:14' },
  { id: 'R-1041', name: 'The Art of Presence · Arabic 16:9', status: 'Queued', progress: 0, priority: 'Normal', attempts: 0, worker: 'Pending', duration: '—' },
  { id: 'R-1040', name: 'Sound Without Limits · Instagram 1:1', status: 'Complete', progress: 100, priority: 'Normal', attempts: 1, worker: 'Worker 01', duration: '01:38' },
];