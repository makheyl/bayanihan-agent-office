import HqApp from '@/components/HqApp';

/** The whole HQ is one client-side page; the server only streams events to it. */
export default function Page() {
  return <HqApp />;
}
