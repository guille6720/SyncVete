import Link from 'next/link';
import { APP_NAME } from '@sincvete/shared';
import { BrandLogo } from '@/components/brand/syncvete-logo';

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/10 bg-[var(--land-ink)] text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-14 sm:px-6 md:flex-row md:justify-between">
        <div className="max-w-sm">
          <BrandLogo href="/" size="lg" variant="onDark" />
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            El sistema de gestión veterinaria para clínicas en Argentina. Agenda, historia
            clínica, farmacia, caja y portal del tutor en una sola plataforma.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
              Producto
            </p>
            <ul className="mt-3 space-y-2 text-sm text-white/70">
              <li>
                <Link href="/#producto" className="hover:text-white">
                  Funciones
                </Link>
              </li>
              <li>
                <Link href="/#planes" className="hover:text-white">
                  Planes
                </Link>
              </li>
              <li>
                <Link href="/#extras" className="hover:text-white">
                  Extras
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="hover:text-white">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
              Cuenta
            </p>
            <ul className="mt-3 space-y-2 text-sm text-white/70">
              <li>
                <Link href="/register" className="hover:text-white">
                  Crear clínica
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-white">
                  Iniciar sesión
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
              Legal
            </p>
            <ul className="mt-3 space-y-2 text-sm text-white/70">
              <li>
                <Link href="/legal/terminos" className="hover:text-white">
                  Términos del Servicio
                </Link>
              </li>
              <li>
                <Link href="/legal/privacidad" className="hover:text-white">
                  Privacidad
                </Link>
              </li>
              <li>
                <Link href="/legal/seguridad" className="hover:text-white">
                  Seguridad
                </Link>
              </li>
              <li>
                <Link href="/legal" className="hover:text-white">
                  Todas las políticas
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} {APP_NAME}. Todos los derechos reservados.
          </p>
          <p>
            <Link href="/legal" className="hover:text-white/70">
              Términos y políticas
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
