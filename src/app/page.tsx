import { Library } from '../features/knowledge/components/library';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <Library
      key={`${String(params.source ?? '')}:${String(params.q ?? '')}`}
      initialSource={typeof params.source === 'string' ? params.source : ''}
      initialQuery={typeof params.q === 'string' ? params.q : ''}
    />
  );
}
