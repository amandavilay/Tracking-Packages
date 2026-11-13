export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; e?: string }> }) {
  const sp = await searchParams;
  return (
    <form action="/api/login" method="post" className="mx-auto mt-24 max-w-xs space-y-4 px-4">
      <h1 className="h1">Shopping Tracker</h1>
      <input type="hidden" name="next" value={sp.next || "/packages"} />
      <input className="input" type="password" name="password" placeholder="Password" autoFocus />
      {sp.e && <p className="text-sm text-red-600">Wrong password</p>}
      <button className="btn w-full">Open</button>
    </form>
  );
}
