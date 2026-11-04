import type { AnchorHTMLAttributes } from 'react';

// S3 serves the same application shell at each library route.
export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />;
}
