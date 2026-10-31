import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  Boxes,
  Cpu,
  LayoutDashboard,
  PlugZap,
  Radio,
  Settings2,
  Users,
  Workflow,
} from 'lucide-react';

export type NavigationItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  section: 'Workspace' | 'Administration';
};

export const navigationItems: NavigationItem[] = [
  { label: 'Overview', to: '/app/overview', icon: LayoutDashboard, section: 'Workspace' },
  { label: 'Instances', to: '/app/instances', icon: Boxes, section: 'Workspace' },
  { label: 'Provisioning', to: '/app/provisioning', icon: Workflow, section: 'Workspace' },
  { label: 'Operations', to: '/app/operations', icon: Activity, section: 'Workspace' },
  { label: 'Events', to: '/app/events', icon: Radio, section: 'Workspace' },
  { label: 'Workers & Queues', to: '/app/workers', icon: Cpu, section: 'Workspace' },
  {
    label: 'Incidents & Recovery',
    to: '/app/incidents',
    icon: AlertTriangle,
    section: 'Workspace',
  },
  { label: 'Connectors', to: '/app/connectors', icon: PlugZap, section: 'Administration' },
  { label: 'Users & Access', to: '/app/users', icon: Users, section: 'Administration' },
  { label: 'Settings', to: '/app/settings', icon: Settings2, section: 'Administration' },
];
