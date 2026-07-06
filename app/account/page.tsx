import Link from "next/link";
import { getTranslations } from "next-intl/server";
import DeleteAccountButton from "../../components/DeleteAccountButton";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ deleteError?: string }>;
}) {
  const t = await getTranslations("account");
  const { deleteError } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (!user) {
    return (
      <main className="mx-auto max-w-md px-6 py-10">
        <h1 className="text-2xl font-bold text-white">{t("title")}</h1>
        <p className="mt-3 text-sm text-white/60">{t("signInRequired")}</p>
        <Link
          href="/login?next=/account"
          className="mt-6 inline-flex rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400"
        >
          {t("signIn")}
        </Link>
      </main>
    );
  }

  const meta = user.user_metadata ?? {};
  const name =
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    null;

  return (
    <main className="mx-auto max-w-md px-6 py-10 pb-28 lg:pb-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/80">
        {t("kicker")}
      </p>
      <h1 className="mt-2 text-2xl font-bold text-white">{t("title")}</h1>

      {deleteError === "1" ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-300">
          {t("deleteError")}
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/3 p-4">
        <p className="text-sm font-semibold text-white">{name ?? user.email}</p>
        {name && user.email ? (
          <p className="mt-1 text-xs text-white/50">{user.email}</p>
        ) : null}
      </div>

      <div className="mt-6 space-y-3">
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10"
          >
            {t("signOut")}
          </button>
        </form>

        <Link
          href="/privacy"
          className="block w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-center text-sm font-semibold text-white/80 transition hover:bg-white/10"
        >
          {t("privacyPolicy")}
        </Link>

        <DeleteAccountButton />
      </div>
    </main>
  );
}
