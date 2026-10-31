import type { PropsWithChildren } from 'react';
import { motion } from 'motion/react';

export function GlassSurface({
  children,
  className = '',
  interactive = false,
}: PropsWithChildren<{ className?: string; interactive?: boolean }>) {
  return (
    <motion.section
      className={['glass-surface', interactive ? 'glass-surface-interactive' : '', className].join(
        ' ',
      )}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      {children}
    </motion.section>
  );
}

export function StatusDot({ tone = 'muted' }: { tone?: 'success' | 'warning' | 'muted' }) {
  return <span className={['status-dot', 'status-dot-' + tone].join(' ')} aria-hidden="true" />;
}
