'use client';

import { useParams } from 'next/navigation';
import { ServiceEditor } from '@/lib/ServiceEditor';

export default function EditServicePage() {
  const { id } = useParams<{ id: string }>();
  return <ServiceEditor key={id} id={id} />;
}
