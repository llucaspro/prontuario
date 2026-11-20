import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show } from '@clerk/react';
import { SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { useForm } from 'react-hook-form';
import {
  useHealthCheck, getHealthCheckQueryKey, useGetDashboard, getGetDashboardQueryKey,
  useListPatients, getListPatientsQueryKey, useCreatePatient, useGetPatient,
  getGetPatientQueryKey, useUpdatePatient, useArchivePatient,
  useListPatientRecords, getListPatientRecordsQueryKey, useCreateRecord, useUpdateRecord,
  useFinalizeRecord, useAmendRecord, useListRecordVersions, getListRecordVersionsQueryKey,
  useListAppointments, getListAppointmentsQueryKey, useCreateAppointment, useUpdateAppointment,
  useGetReports, getGetReportsQueryKey, useListDocuments, getListDocumentsQueryKey,
  useGetProfile, getGetProfileQueryKey, useUpdateProfile,
  useListAuditEvents, getListAuditEventsQueryKey, exportDocument,
} from '@workspace/api-client-react';
import type {
  Patient, PatientInput, PatientUpdate, PatientStatus, Appointment, AppointmentInput,
  AppointmentUpdate, RecordEntry, RecordInput, RecordUpdate, RecordAmendmentInput,
  DocumentExportInput, ProfessionalProfileUpdate,
} from '@workspace/api-client-react';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, CalendarDays, Check, ChevronLeft, ChevronRight,
  CircleHelp, Clock3, FileCheck2, FileText, FolderOpen, LockKeyhole, LogOut, Plus,
  Search, Settings, ShieldCheck, Stethoscope, UserRound, Users, X, Download, Eye, Archive,
} from 'lucide-react';
import { toast } from 'sonner';
import NotFound from '@/pages/not-found';
import { Toaster } from '@/components/ui/toaster';

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}
const appearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#435f50', colorForeground: '#303832', colorMutedForeground: '#737b74',
    colorDanger: '#9c3f3c', colorBackground: '#ffffff', colorInput: '#ffffff',
    colorInputForeground: '#303832', colorNeutral: '#303832', fontFamily: 'DM Sans',
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-white rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#e9e7e0]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#303832] font-medium',
    headerSubtitle: 'text-[#737b74]',
    socialButtonsBlockButtonText: 'text-[#303832]',
    formFieldLabel: 'text-[#505a52]',
    footerActionLink: 'text-[#435f50]',
    footerActionText: 'text-[#737b74]',
    dividerText: 'text-[#737b74]',
    identityPreviewEditButton: 'text-[#435f50]',
    formFieldSuccessText: 'text-[#435f50]',
    alertText: 'text-[#303832]',
    logoBox: 'rounded-full',
    logoImage: 'rounded-full',
    socialButtonsBlockButton: 'border-[#e9e7e0] rounded-xl',
    formButtonPrimary: 'bg-[#435f50] hover:bg-[#38503f] rounded-xl',
    formFieldInput: 'border-[#e9e7e0] rounded-xl',
    footerAction: 'text-[#737b74]',
    dividerLine: 'bg-[#e9e7e0]',
    alert: 'rounded-xl',
    otpCodeFieldInput: 'border-[#e9e7e0]',
    formFieldRow: 'gap-3',
    main: 'gap-5',
  },
};

const navItems = [
  ['/dashboard', 'Visão geral', Activity],
  ['/patients', 'Pacientes', Users],
  ['/records', 'Prontuários', FileText],
  ['/agenda', 'Agenda', CalendarDays],
  ['/appointments', 'Atendimentos', Clock3],
  ['/reports', 'Relatórios', BarChart3],
  ['/documents', 'Documentos', FolderOpen],
  ['/settings', 'Configurações', Settings],
  ['/security', 'Segurança', ShieldCheck],
] as const;
const pageNames: Record<string, string> = Object.fromEntries(navItems.map(([path, name]) => [path, name]));
const statusLabels: Record<string, string> = {
  in_follow_up: 'Em acompanhamento', initial_evaluation: 'Avaliação inicial', paused: 'Pausado',
  discharged: 'Alta', scheduled: 'Agendado', confirmed: 'Confirmado', completed: 'Concluído',
  canceled: 'Cancelado', no_show: 'Não compareceu', draft: 'Rascunho', finalized: 'Finalizado',
};
const shortDate = (date?: string | null) => date ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date)) : '—';
const time = (date?: string | null) => date ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(date)) : '—';
const initials = (name?: string) => (name || 'PS').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const statusTone = (status: string) => ['initial_evaluation', 'scheduled'].includes(status) ? 'badge badge-warm' :
  ['paused', 'canceled', 'draft'].includes(status) ? 'badge badge-muted' :
  ['completed', 'finalized', 'confirmed'].includes(status) ? 'badge badge-blue' :
  ['no_show'].includes(status) ? 'badge badge-red' : 'badge';
const invalidate = async (client: ReturnType<typeof useQueryClient>, keys: unknown[][]) => {
  await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
};

function Brand() {
  return <Link href="/" className="brand" data-testid="link-brand">
    <span className="brand-mark"><Stethoscope size={17} strokeWidth={1.7} /></span><span>Pensare</span>
  </Link>;
}
function PageTitle({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1>{subtitle && <p className="muted" style={{ margin: '7px 0 0', fontSize: 13 }}>{subtitle}</p>}</div>{action}</div>;
}
function Panel({ title, children, action, className = '', style }: { title?: string; children: ReactNode; action?: ReactNode; className?: string; style?: CSSProperties }) {
  return <section className={`surface ${className}`} style={style}><div className="surface-title">{title ? <h2>{title}</h2> : <span />}{action}</div>{children}</section>;
}
function Button({ children, primary, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return <button {...props} className={`btn ${primary ? 'btn-primary' : ''} ${props.className || ''}`}>{children}</button>;
}
function Status({ value }: { value: string }) {
  return <span className={statusTone(value)} data-testid={`status-${value}`}>{statusLabels[value] || value}</span>;
}
function LoadingBlock() {
  return <div aria-label="Carregando" data-testid="loading-state"><div className="skeleton" style={{ height: 34, width: 230, marginBottom: 22 }} /><div className="kpi-grid">{[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 110 }} />)}</div><div className="skeleton" style={{ height: 240 }} /></div>;
}
function QueryState({ loading, error, retry }: { loading: boolean; error: boolean; retry: () => void }) {
  if (loading) return <LoadingBlock />;
  if (error) return <div className="surface empty-state" role="alert"><div className="empty-icon"><CircleHelp /></div><b>Não foi possível carregar os dados</b><p>Verifique sua conexão e tente novamente.</p><Button onClick={retry} data-testid="button-retry">Tentar novamente</Button></div>;
  return null;
}
function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state" data-testid="empty-state"><div className="empty-icon"><FileText size={21} /></div><b>{title}</b><p>{detail}</p></div>;
}
function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return <label className="form-field"><span>{label}</span>{children}{error && <small role="alert" style={{ color: '#9c3f3c' }}>{error}</small>}</label>;
}
function Modal({ title, detail, onClose, children, testId }: { title: string; detail?: string; onClose: () => void; children: ReactNode; testId: string }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby={`${testId}-title`} data-testid={testId}>
      <div className="surface-title"><div><h2 id={`${testId}-title`}>{title}</h2>{detail && <p className="muted" style={{ margin: '5px 0 0', fontSize: 13 }}>{detail}</p>}</div><button type="button" className="btn btn-small" onClick={onClose} aria-label="Fechar" data-testid="button-close-modal"><X size={16} /></button></div>
      {children}
    </section>
  </div>;
}
function Home() {
  return <main className="landing" data-testid="public-home">
    <header className="landing-header"><Brand /><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Link href="/sign-in" className="btn" data-testid="link-sign-in">Entrar</Link><Link href="/sign-up" className="btn btn-primary" data-testid="link-sign-up">Começar</Link></div></header>
    <section className="landing-hero">
      <div><span className="badge" style={{ marginBottom: 22 }}>Cuidado profissional, rotina organizada</span>
        <h1>Mais presença.<br />Menos papelada.</h1>
        <p className="muted" style={{ fontSize: 17, lineHeight: 1.7, maxWidth: 500, margin: '24px 0 28px' }}>Pensare é o espaço de trabalho para psicólogas e psicólogos que querem cuidar da prática com clareza, tempo e privacidade.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><Link href="/sign-up" className="btn btn-primary" data-testid="link-start">Conheça o Pensare <ArrowRight size={16} /></Link><a href="#privacidade" className="btn" data-testid="link-privacy">Como protegemos a rotina</a></div>
      </div>
      <div className="hero-art" aria-hidden="true"><div style={{ zIndex: 2, textAlign: 'center', color: '#435f50' }}><div className="hero-leaf"><Stethoscope size={46} strokeWidth={1.25} /></div><div className="serif" style={{ fontSize: 34, marginTop: 14 }}>Pensare</div><div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', marginTop: 4 }}>um espaço de cuidado</div></div></div>
    </section>
    <section className="landing-section landing-grid" id="privacidade">
      <div><span className="muted" style={{ letterSpacing: 1.8, fontSize: 11, textTransform: 'uppercase' }}>Feito para a prática real</span><h2 style={{ margin: '12px 0 15px' }}>Sua atenção fica onde importa.</h2><p className="muted" style={{ maxWidth: 560, lineHeight: 1.8 }}>Agenda, cadastro e documentação clínica convivem em um sistema desenhado para respeitar o contexto sensível de cada atendimento. O que é clínico permanece no prontuário — não em painéis ou resumos administrativos.</p></div>
      <div className="surface" style={{ borderLeft: '3px solid #829b8b' }}><div className="empty-icon"><LockKeyhole /></div><h3 style={{ fontSize: 20, color: '#435f50' }}>Privacidade no cotidiano</h3><p className="muted" style={{ lineHeight: 1.75, marginBottom: 0 }}>Acesso autenticado, registros sob responsabilidade profissional e indicadores administrativos sem conteúdo clínico.</p></div>
    </section>
    <section className="landing-section"><div style={{ maxWidth: 760 }}><span className="muted" style={{ letterSpacing: 1.8, fontSize: 11, textTransform: 'uppercase' }}>Um fluxo mais leve</span><h2 style={{ margin: '12px 0 25px' }}>Tudo se encontra. Nada se mistura.</h2></div>
      <div className="landing-grid" style={{ alignItems: 'stretch' }}><div className="surface"><div className="kpi-symbol"><CalendarDays size={19} /></div><h3 style={{ fontSize: 22, margin: '15px 0 6px' }}>Uma agenda que acompanha você</h3><p className="muted" style={{ lineHeight: 1.7 }}>Visualize compromissos e acompanhe cada etapa do atendimento em um único lugar.</p></div><div className="surface"><div className="kpi-symbol"><FileCheck2 size={19} /></div><h3 style={{ fontSize: 22, margin: '15px 0 6px' }}>Registros com contexto</h3><p className="muted" style={{ lineHeight: 1.7 }}>Evoluções cronológicas, estados de revisão e histórico de versões para uma documentação cuidadosa.</p></div></div>
    </section>
    <section className="landing-section" style={{ background: '#eaf0e9' }}><div className="landing-grid"><div><h2>Uma clínica bem cuidada começa nos detalhes.</h2><p className="muted" style={{ lineHeight: 1.8 }}>Perfis profissionais, relatórios administrativos e trilha de auditoria organizados para dar suporte ao seu trabalho — sem transformar cuidado em planilha.</p></div><div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}><Link href="/sign-up" className="btn btn-primary" data-testid="link-create-account">Criar minha conta <ArrowRight size={16} /></Link><Link href="/sign-in" className="muted" data-testid="link-access-account">Já tenho acesso</Link></div></div></section>
    <footer className="landing-foot">Pensare · Tecnologia que respeita o cuidado.</footer>
  </main>;
}
function HomeRedirect() {
  return <><Show when="signed-in"><Redirect to="/dashboard" /></Show><Show when="signed-out"><Home /></Show></>;
}
function Protected({ children }: { children: ReactNode }) {
  return <><Show when="signed-in">{children}</Show><Show when="signed-out"><Redirect to="/" /></Show></>;
}
function ClerkCacheReset() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUser = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUser.current !== undefined && previousUser.current !== userId) client.clear();
      previousUser.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}
function AuthFrame() {
  return <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20, background: '#f8f7f3' }}><div style={{ width: 'min(440px,100%)' }}><div style={{ display: 'flex', justifyContent: 'center' }}><Brand /></div><Switch>
    <Route path="/sign-in/*?"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></Route>
    <Route path="/sign-up/*?"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></Route>
  </Switch></div></div>;
}
function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: profile } = useGetProfile();
  const { data: health } = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), staleTime: 60_000 } });
  const { signOut } = useClerk();
  const name = profile?.displayName || 'Profissional';
  return <div className="pensare-shell">
    <aside className="pensare-sidebar">
      <Brand />
      <nav aria-label="Navegação principal" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {navItems.map(([path, label, Icon]) => <Link href={path} key={path} className={`side-link ${location === path || (path === '/patients' && location.startsWith('/patients/')) ? 'active' : ''}`} data-testid={`nav-${path.slice(1)}`} aria-label={label}><Icon size={18} strokeWidth={1.7} /><span>{label}</span></Link>)}
      </nav>
      <div className="sidebar-profile"><div className="avatar-initials">{initials(name)}</div><div style={{ minWidth: 0 }}><b style={{ fontSize: 12, fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</b><small className="muted">{profile?.professionalRegistration || 'Perfil profissional'}</small></div></div>
    </aside>
    <main className="pensare-main">
      <header className="pensare-header"><div style={{ flex: 1 }}><div className="muted" style={{ fontSize: 11 }}>Pensare <span style={{ margin: '0 5px' }}>/</span> <b style={{ color: '#303832', fontWeight: 600 }}>{pageNames[location] || (location.startsWith('/patients/') ? 'Paciente' : 'Pensare')}</b></div><div style={{ font: '19px var(--app-font-serif)', marginTop: 2 }}>{pageNames[location] || (location.startsWith('/patients/') ? 'Paciente' : 'Pensare')}</div></div>
        <div className="muted" style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }} title={health?.status || 'Verificação de serviço'}><span style={{ width: 7, height: 7, borderRadius: 9, background: health?.status === 'ok' ? '#829b8b' : '#c9b27a' }} />Ambiente protegido</div>
        <Button aria-label="Sair" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out"><LogOut size={16} /><span className="desktop-label">Sair</span></Button>
      </header>
      <div className="pensare-page">{children}</div>
    </main>
  </div>;
}

function DashboardPage() {
  const query = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });
  if (query.isLoading || query.isError) return <QueryState loading={query.isLoading} error={query.isError} retry={() => void query.refetch()} />;
  const data = query.data;
  const stats = [
    [Users, data?.activePatients ?? 0, 'Pacientes ativos'],
    [Check, data?.sessionsThisMonth ?? 0, 'Sessões neste mês'],
    [CalendarDays, data?.appointmentsToday ?? 0, 'Atendimentos hoje'],
  ] as const;
  return <><PageTitle title="Bom dia, profissional" subtitle="Sua rotina, em um só lugar. Conteúdo clínico não aparece nesta visão." />
    <div className="kpi-grid">{stats.map(([Icon, value, label]) => <section className="surface" key={label} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="kpi-symbol"><Icon size={19} /></div><div className="kpi-value">{value}</div><div className="muted" style={{ fontSize: 12 }}>{label}</div></section>)}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(270px,.8fr)', gap: 18 }}>
      <Panel title="Agenda de hoje" action={<Link href="/agenda" className="btn btn-small" data-testid="link-full-agenda">Ver agenda <ArrowRight size={14} /></Link>}>
        {data?.todayAppointments?.length ? data.todayAppointments.map((item) => <div className="row-list" key={item.id} data-testid={`appointment-today-${item.id}`}><span className="muted" style={{ width: 44, fontSize: 12 }}>{time(item.scheduledAt)}</span><div className="avatar-initials">{initials(item.patientName)}</div><div className="row-list-main"><b style={{ fontWeight: 600, fontSize: 13 }}>{item.patientName}</b><small>{item.appointmentType}</small></div><Status value={item.status} /></div>) : <EmptyState title="Nenhum atendimento hoje" detail="Os próximos compromissos aparecem aqui." />}
      </Panel>
      <Panel title="Próximos atendimentos">
        {data?.upcomingAppointments?.length ? data.upcomingAppointments.slice(0, 6).map((item) => <div className="row-list" key={item.id} data-testid={`appointment-upcoming-${item.id}`}><div className="kpi-symbol" style={{ width: 36, height: 36 }}><CalendarDays size={16} /></div><div className="row-list-main"><b style={{ fontWeight: 600, fontSize: 13 }}>{shortDate(item.scheduledAt)}</b><small>{time(item.scheduledAt)} · {item.patientName}</small></div></div>) : <EmptyState title="Agenda em aberto" detail="Nenhum atendimento futuro cadastrado." />}
      </Panel>
    </div>
    <Panel title="Atividade recente" style={{ marginTop: 18 }}>
      {data?.recentActivity?.length ? data.recentActivity.map((item) => <div className="row-list" key={item.id} data-testid={`activity-${item.id}`}><div className="kpi-symbol" style={{ width: 34, height: 34 }}><Activity size={15} /></div><div className="row-list-main"><b style={{ fontWeight: 600, fontSize: 13 }}>{item.category === 'record' ? 'Registro clínico atualizado' : item.category === 'appointment' ? 'Atendimento atualizado' : 'Atividade da clínica'}</b><small>{shortDate(item.occurredAt)}</small></div><span className="muted" style={{ fontSize: 12 }}>Atualização</span></div>) : <EmptyState title="Sem atividade recente" detail="As atualizações administrativas aparecerão aqui." />}
    </Panel>
  </>;
}

type PatientFormValues = { fullName: string; email: string; phone: string; birthDate: string; status: PatientStatus; startDate: string };
function PatientForm({ initial, onSubmit, busy, submitLabel }: { initial?: Patient; onSubmit: (values: PatientInput | PatientUpdate) => void; busy: boolean; submitLabel: string }) {
  const form = useForm<PatientFormValues>({ defaultValues: initial ? {
    fullName: initial.fullName, email: initial.email || '', phone: initial.phone || '', birthDate: initial.birthDate || '',
    status: initial.status, startDate: initial.startDate.slice(0, 10),
  } : { fullName: '', email: '', phone: '', birthDate: '', status: 'initial_evaluation', startDate: new Date().toISOString().slice(0, 10) } });
  return <form onSubmit={form.handleSubmit((values) => onSubmit({ ...values, email: values.email || null, phone: values.phone || null, birthDate: values.birthDate || null }))} data-testid="form-patient">
    <Field label="Nome completo" error={form.formState.errors.fullName?.message}><input className="form-control" data-testid="input-patient-name" {...form.register('fullName', { required: 'Informe o nome completo', minLength: { value: 2, message: 'Use pelo menos 2 caracteres' } })} /></Field>
    <div className="form-grid"><Field label="E-mail"><input type="email" className="form-control" data-testid="input-patient-email" {...form.register('email')} /></Field><Field label="Telefone"><input className="form-control" data-testid="input-patient-phone" {...form.register('phone')} /></Field></div>
    <div className="form-grid"><Field label="Data de nascimento"><input type="date" className="form-control" data-testid="input-patient-birth-date" {...form.register('birthDate')} /></Field><Field label="Situação"><select className="form-control" data-testid="select-patient-status" {...form.register('status')}><option value="initial_evaluation">Avaliação inicial</option><option value="in_follow_up">Em acompanhamento</option><option value="paused">Pausado</option><option value="discharged">Alta</option></select></Field></div>
    <Field label="Início do acompanhamento"><input type="date" className="form-control" data-testid="input-patient-start-date" {...form.register('startDate', { required: 'Informe a data de início' })} /></Field>
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Button type="submit" primary disabled={busy} data-testid="button-save-patient">{busy ? 'Salvando…' : submitLabel}</Button></div>
  </form>;
}
function PatientsPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const params = useMemo(() => ({ ...(search ? { search } : {}), ...(status !== 'all' ? { status: status as PatientStatus } : {}), ...(includeArchived ? { includeArchived: true } : {}) }), [search, status, includeArchived]);
  const query = useListPatients(params, { query: { queryKey: getListPatientsQueryKey(params) } });
  const create = useCreatePatient();
  const archive = useArchivePatient();
  const patients = query.data || [];
  const submit = (values: PatientInput | PatientUpdate) => create.mutate({ data: values as PatientInput }, {
    onSuccess: async () => { await invalidate(client, [getListPatientsQueryKey(params), getGetDashboardQueryKey()]); setCreating(false); toast.success('Cadastro criado.'); },
    onError: () => toast.error('Não foi possível criar o cadastro.'),
  });
  return <><PageTitle title="Pacientes" subtitle="Cadastros e situação de acompanhamento." action={<Button primary onClick={() => setCreating(true)} data-testid="button-new-patient"><Plus size={16} />Novo paciente</Button>} />
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 220, flex: 1 }}><Search size={16} className="muted" /><input className="form-control" aria-label="Buscar pacientes" placeholder="Buscar por nome ou contato" value={search} onChange={(event) => setSearch(event.target.value)} data-testid="input-patient-search" /></label>
      <select className="form-control" style={{ width: 'auto' }} value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrar situação" data-testid="select-patient-filter"><option value="all">Todas as situações</option><option value="in_follow_up">Em acompanhamento</option><option value="initial_evaluation">Avaliação inicial</option><option value="paused">Pausado</option><option value="discharged">Alta</option></select>
      <label className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} data-testid="toggle-archived" />Incluir arquivados</label>
    </div>
    {query.isLoading || query.isError ? <QueryState loading={query.isLoading} error={query.isError} retry={() => void query.refetch()} /> :
      <div className="surface table-scroll" style={{ padding: 12 }}>
        {patients.length ? <table className="data-table"><thead><tr><th>Paciente</th><th>Situação</th><th>Início</th><th>Contato</th><th>Ações</th></tr></thead><tbody>{patients.map((patient) => <tr key={patient.id} data-testid={`row-patient-${patient.id}`}><td><Link href={`/patients/${patient.id}`} className="row-list" style={{ padding: 0, border: 0, color: 'inherit', textDecoration: 'none' }} data-testid={`link-patient-${patient.id}`}><div className="avatar-initials">{initials(patient.fullName)}</div><b style={{ fontWeight: 600 }}>{patient.fullName}</b></Link></td><td><Status value={patient.status} />{patient.archivedAt && <span className="muted" style={{ marginLeft: 7, fontSize: 11 }}>Arquivado</span>}</td><td>{shortDate(patient.startDate)}</td><td className="muted">{patient.email || patient.phone || '—'}</td><td><div style={{ display: 'flex', gap: 6 }}><Link href={`/patients/${patient.id}`} className="btn btn-small" aria-label={`Abrir ${patient.fullName}`} data-testid={`button-open-patient-${patient.id}`}><ArrowRight size={14} /></Link>{!patient.archivedAt && <Button className="btn-small btn-danger" disabled={archive.isPending} aria-label={`Arquivar ${patient.fullName}`} onClick={() => { if (window.confirm('Arquivar este cadastro? Os registros serão preservados.')) archive.mutate({ patientId: patient.id }, { onSuccess: async () => { await invalidate(client, [getListPatientsQueryKey(params), getGetPatientQueryKey(patient.id)]); toast.success('Cadastro arquivado.'); }, onError: () => toast.error('Não foi possível arquivar o cadastro.') }); }} data-testid={`button-archive-${patient.id}`}><Archive size={14} /></Button>}</div></td></tr>)}</tbody></table> : <EmptyState title="Nenhum cadastro encontrado" detail="Ajuste os filtros ou cadastre um novo paciente." />}
      </div>}
    {creating && <Modal title="Novo paciente" detail="Cadastre apenas as informações necessárias ao acompanhamento." onClose={() => setCreating(false)} testId="modal-create-patient"><PatientForm onSubmit={submit} busy={create.isPending} submitLabel="Cadastrar paciente" /></Modal>}
  </>;
}
function PatientDetailPage() {
  const { id = '' } = useParams();
  const client = useQueryClient();
  const query = useGetPatient(id, { query: { queryKey: getGetPatientQueryKey(id), enabled: !!id } });
  const update = useUpdatePatient();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<'overview' | 'records'>('overview');
  const records = useListPatientRecords(id, { query: { queryKey: getListPatientRecordsQueryKey(id), enabled: !!id } });
  const patient = query.data;
  if (query.isLoading || query.isError || !patient) return <QueryState loading={query.isLoading} error={query.isError} retry={() => void query.refetch()} />;
  return <>
    <PageTitle title={patient.fullName} subtitle={<span>{shortDate(patient.startDate)} · <Status value={patient.status} /></span>} action={<div style={{ display: 'flex', gap: 8 }}><Link href="/patients" className="btn" data-testid="link-back-patients"><ArrowLeft size={15} />Pacientes</Link><Button onClick={() => setEditing(true)} data-testid="button-edit-patient"><UserRound size={15} />Editar cadastro</Button></div>} />
    <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #e9e7e0', marginBottom: 18 }}><button className="btn" style={{ border: 0, borderRadius: 0, borderBottom: tab === 'overview' ? '2px solid #435f50' : '2px solid transparent' }} onClick={() => setTab('overview')} data-testid="tab-overview">Visão geral</button><button className="btn" style={{ border: 0, borderRadius: 0, borderBottom: tab === 'records' ? '2px solid #435f50' : '2px solid transparent' }} onClick={() => setTab('records')} data-testid="tab-patient-records">Prontuário</button></div>
    {tab === 'overview' ? <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,.8fr) minmax(0,1.2fr)', gap: 18 }}><Panel title="Informações administrativas"><div className="row-list"><span className="muted" style={{ flex: 1 }}>E-mail</span><b>{patient.email || '—'}</b></div><div className="row-list"><span className="muted" style={{ flex: 1 }}>Telefone</span><b>{patient.phone || '—'}</b></div><div className="row-list"><span className="muted" style={{ flex: 1 }}>Nascimento</span><b>{shortDate(patient.birthDate)}</b></div><div className="row-list"><span className="muted" style={{ flex: 1 }}>Cadastro desde</span><b>{shortDate(patient.createdAt)}</b></div></Panel><Panel title="Registros recentes" action={<button className="btn btn-small" onClick={() => setTab('records')} data-testid="button-view-records">Ver prontuário</button>}>{records.data?.length ? records.data.slice(0, 4).map((record) => <div className="row-list" key={record.id} data-testid={`patient-record-${record.id}`}><div className="kpi-symbol"><FileText size={17} /></div><div className="row-list-main"><b>{shortDate(record.occurredAt)}</b><small>{record.sessionType}</small></div><Status value={record.status} /></div>) : <EmptyState title="Sem registros disponíveis" detail="Novas evoluções poderão ser registradas no prontuário." />}</Panel></div> : <RecordsPage patientId={patient.id} />}
    {editing && <Modal title="Editar cadastro" onClose={() => setEditing(false)} testId="modal-edit-patient"><PatientForm initial={patient} busy={update.isPending} submitLabel="Salvar alterações" onSubmit={(values) => update.mutate({ patientId: patient.id, data: values }, { onSuccess: async () => { await invalidate(client, [getGetPatientQueryKey(patient.id), getListPatientsQueryKey()]); setEditing(false); toast.success('Cadastro atualizado.'); }, onError: () => toast.error('Não foi possível atualizar o cadastro.') })} /></Modal>}
  </>;
}

type RecordFormValues = { occurredAt: string; recordKind: 'psychological_record' | 'restricted_document'; sessionType: string; goal: string; progress: string; professionalNotes: string; interventions: string; justification: string };
function RecordEditor({ record, onSave, busy, amendment = false }: { record?: RecordEntry; onSave: (values: RecordInput | RecordUpdate | RecordAmendmentInput) => void; busy: boolean; amendment?: boolean }) {
  const form = useForm<RecordFormValues>({ defaultValues: { occurredAt: record?.occurredAt?.slice(0, 16) || new Date().toISOString().slice(0, 16), recordKind: record?.recordKind || 'psychological_record', sessionType: record?.sessionType || '', goal: record?.goal || '', progress: record?.progress || '', professionalNotes: record?.professionalNotes || '', interventions: record?.interventions || '', justification: '' } });
  const submit = form.handleSubmit((values) => onSave({
    occurredAt: new Date(values.occurredAt).toISOString(), sessionType: values.sessionType,
    ...(amendment ? { justification: values.justification } : { recordKind: values.recordKind }),
    goal: values.goal || null, progress: values.progress,
    professionalNotes: values.professionalNotes || null, interventions: values.interventions || null,
  } as RecordInput | RecordUpdate | RecordAmendmentInput));
  return <form onSubmit={submit} data-testid="form-record">
    <div className="form-grid"><Field label="Data e hora"><input type="datetime-local" className="form-control" data-testid="input-record-date" {...form.register('occurredAt', { required: true })} /></Field><Field label="Tipo de sessão"><input className="form-control" data-testid="input-record-session-type" {...form.register('sessionType', { required: 'Informe o tipo da sessão', minLength: 2 })} /></Field></div>
    {!amendment && <Field label="Classificação do registro"><select className="form-control" data-testid="select-record-kind" {...form.register('recordKind')}><option value="psychological_record">Prontuário psicológico</option><option value="restricted_document">Documento restrito</option></select></Field>}
    <Field label="Objetivo"><textarea className="form-control" data-testid="input-record-goal" {...form.register('goal')} /></Field>
    <Field label="Evolução" error={form.formState.errors.progress ? 'Informe a evolução registrada.' : undefined}><textarea className="form-control" data-testid="input-record-progress" {...form.register('progress', { required: true, minLength: 1 })} /></Field>
    <div className="form-grid"><Field label="Notas profissionais"><textarea className="form-control" data-testid="input-record-notes" {...form.register('professionalNotes')} /></Field><Field label="Intervenções"><textarea className="form-control" data-testid="input-record-interventions" {...form.register('interventions')} /></Field></div>
    {amendment && <Field label="Justificativa da alteração"><textarea className="form-control" data-testid="input-amendment-reason" {...form.register('justification', { required: 'A justificativa é obrigatória', minLength: 5 })} /></Field>}
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Button type="submit" primary disabled={busy} data-testid="button-save-record">{busy ? 'Salvando…' : amendment ? 'Registrar versão corrigida' : record ? 'Salvar rascunho' : 'Criar rascunho'}</Button></div>
  </form>;
}
function RecordsPage({ patientId: fixedPatientId }: { patientId?: string }) {
  const client = useQueryClient();
  const patientsQuery = useListPatients({}, { query: { queryKey: getListPatientsQueryKey({}) } });
  const [patientId, setPatientId] = useState(fixedPatientId || '');
  const recordsQuery = useListPatientRecords(patientId, { query: { enabled: !!patientId, queryKey: getListPatientRecordsQueryKey(patientId) } });
  const create = useCreateRecord();
  const update = useUpdateRecord();
  const finalize = useFinalizeRecord();
  const amend = useAmendRecord();
  const [editing, setEditing] = useState<RecordEntry | 'new' | null>(null);
  const [amending, setAmending] = useState<RecordEntry | null>(null);
  const [selected, setSelected] = useState('');
  const versions = useListRecordVersions(selected || '', { query: { enabled: !!selected, queryKey: getListRecordVersionsQueryKey(selected || '') } });
  const currentRecords = recordsQuery.data || [];
  const saveRecord = (values: RecordInput | RecordUpdate | RecordAmendmentInput) => {
    if (editing === 'new') create.mutate({ patientId, data: values as RecordInput }, {
      onSuccess: async () => { await invalidate(client, [getListPatientRecordsQueryKey(patientId), getGetDashboardQueryKey()]); setEditing(null); toast.success('Rascunho criado.'); },
      onError: () => toast.error('Não foi possível criar o rascunho.'),
    });
    else if (editing) update.mutate({ recordId: editing.id, data: values as RecordUpdate }, {
      onSuccess: async () => { await invalidate(client, [getListPatientRecordsQueryKey(patientId), getListRecordVersionsQueryKey(editing.id)]); setEditing(null); toast.success('Rascunho atualizado.'); },
      onError: () => toast.error('Não foi possível atualizar o registro.'),
    });
  };
  const runAmend = (values: RecordInput | RecordUpdate | RecordAmendmentInput) => {
    if (!amending) return;
    amend.mutate({ recordId: amending.id, data: values as RecordAmendmentInput }, {
      onSuccess: async () => { await invalidate(client, [getListPatientRecordsQueryKey(patientId), getListRecordVersionsQueryKey(amending.id)]); setAmending(null); toast.success('Alteração justificada registrada.'); },
      onError: () => toast.error('Não foi possível registrar a alteração.'),
    });
  };
  return <><PageTitle title="Prontuários" subtitle="Registros clínicos em ordem cronológica, com versões e estados de finalização." action={patientId ? <Button primary onClick={() => setEditing('new')} data-testid="button-new-record"><Plus size={16} />Nova evolução</Button> : undefined} />
    {!fixedPatientId && <Field label="Paciente"><select className="form-control" value={patientId} onChange={(event) => { setPatientId(event.target.value); setSelected(''); }} data-testid="select-record-patient"><option value="">Selecione um paciente</option>{patientsQuery.data?.map((patient) => <option key={patient.id} value={patient.id}>{patient.fullName}</option>)}</select></Field>}
    {!patientId ? <Panel><EmptyState title="Selecione um paciente" detail="Os registros clínicos só são exibidos dentro do contexto do paciente." /></Panel> :
      recordsQuery.isLoading || recordsQuery.isError ? <QueryState loading={recordsQuery.isLoading} error={recordsQuery.isError} retry={() => void recordsQuery.refetch()} /> :
      currentRecords.length ? <div className="timeline">{currentRecords.map((record) => <article key={record.id} className={`timeline-entry ${record.status === 'finalized' ? 'final' : ''}`} data-testid={`record-entry-${record.id}`}><Panel title={`${shortDate(record.occurredAt)} · ${record.sessionType}`} action={<Status value={record.status} />}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}><span className="muted" style={{ fontSize: 12 }}>Versão {record.version} · Atualizado {shortDate(record.updatedAt)}</span><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}><Button className="btn-small" onClick={() => setSelected(selected === record.id ? '' : record.id)} data-testid={`button-versions-${record.id}`}><Eye size={14} />Versões</Button>{record.status === 'draft' ? <><Button className="btn-small" onClick={() => setEditing(record)} data-testid={`button-edit-record-${record.id}`}>Editar rascunho</Button><Button className="btn-small btn-primary" onClick={() => { if (window.confirm('Finalizar este registro? Após finalizado, alterações exigem justificativa.')) finalize.mutate({ recordId: record.id }, { onSuccess: async () => { await invalidate(client, [getListPatientRecordsQueryKey(patientId), getListRecordVersionsQueryKey(record.id)]); toast.success('Registro finalizado.'); }, onError: () => toast.error('Não foi possível finalizar o registro.') }); }} data-testid={`button-finalize-${record.id}`}><Check size={14} />Finalizar</Button></> : <Button className="btn-small" onClick={() => setAmending(record)} data-testid={`button-amend-${record.id}`}>Alterar com justificativa</Button>}</div></div>
        {record.goal && <div style={{ marginTop: 16 }}><b style={{ fontSize: 12 }}>Objetivo</b><p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{record.goal}</p></div>}
        <div style={{ marginTop: 14 }}><b style={{ fontSize: 12 }}>Evolução</b><p style={{ margin: '4px 0', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{record.progress}</p></div>
        {record.professionalNotes && <div style={{ marginTop: 12 }}><b style={{ fontSize: 12 }}>Notas profissionais</b><p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{record.professionalNotes}</p></div>}
        {record.interventions && <div style={{ marginTop: 12 }}><b style={{ fontSize: 12 }}>Intervenções</b><p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{record.interventions}</p></div>}
        {record.amendmentReason && <div style={{ marginTop: 12, padding: 12, background: '#f8f7f3', borderRadius: 9 }}><b style={{ fontSize: 12 }}>Justificativa da versão</b><p style={{ margin: '4px 0' }}>{record.amendmentReason}</p></div>}
        {selected === record.id && <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #e9e7e0' }}><b>Histórico de versões</b>{versions.isLoading ? <p className="muted">Carregando versões…</p> : versions.data?.length ? versions.data.map((version) => <div className="row-list" key={version.id} data-testid={`record-version-${version.id}`}><div className="row-list-main"><b>Versão {version.version} · {shortDate(version.updatedAt)}</b><small>{statusLabels[version.status]}</small></div>{version.amendmentReason && <span className="muted" style={{ fontSize: 12 }}>Justificativa registrada</span>}</div>) : <p className="muted">Nenhuma versão anterior.</p>}</div>}
      </Panel></article>)}</div> : <Panel><EmptyState title="Nenhuma evolução registrada" detail="Crie um rascunho para iniciar o registro cronológico." /></Panel>}
    {editing && <Modal title={editing === 'new' ? 'Nova evolução' : 'Editar rascunho'} detail="O registro permanece em rascunho até ser finalizado." onClose={() => setEditing(null)} testId="modal-record"><RecordEditor record={editing === 'new' ? undefined : editing} onSave={saveRecord} busy={create.isPending || update.isPending} /></Modal>}
    {amending && <Modal title="Alteração justificada" detail="A versão original será preservada no histórico." onClose={() => setAmending(null)} testId="modal-amend-record"><RecordEditor record={amending} amendment onSave={runAmend} busy={amend.isPending} /></Modal>}
  </>;
}

type AppointmentFormValues = { patientId: string; scheduledAt: string; durationMinutes: number; appointmentType: string };
function localDateTime(date: string) {
  const value = new Date(date);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
function AppointmentForm({ patients, initial, onSave, busy }: { patients: Patient[]; initial?: Appointment; onSave: (values: AppointmentInput | AppointmentUpdate) => void; busy: boolean }) {
  const form = useForm<AppointmentFormValues>({ defaultValues: { patientId: initial?.patientId || '', scheduledAt: initial ? localDateTime(initial.scheduledAt) : '', durationMinutes: initial?.durationMinutes || 50, appointmentType: initial?.appointmentType || 'Psicoterapia individual' } });
  return <form onSubmit={form.handleSubmit((v) => onSave({ scheduledAt: new Date(v.scheduledAt).toISOString(), durationMinutes: Number(v.durationMinutes), appointmentType: v.appointmentType, ...(!initial ? { patientId: v.patientId } : {}) }))} data-testid="form-appointment">
    {!initial && <Field label="Paciente"><select className="form-control" data-testid="select-appointment-patient" {...form.register('patientId', { required: true })}><option value="">Selecione</option>{patients.filter((p) => !p.archivedAt).map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}</select></Field>}
    <div className="form-grid"><Field label="Data e hora"><input type="datetime-local" className="form-control" data-testid="input-appointment-date" {...form.register('scheduledAt', { required: true })} /></Field><Field label="Duração (minutos)"><input type="number" min={15} max={180} className="form-control" data-testid="input-appointment-duration" {...form.register('durationMinutes', { valueAsNumber: true, min: 15, max: 180 })} /></Field></div>
    <Field label="Tipo de atendimento"><input className="form-control" data-testid="input-appointment-type" {...form.register('appointmentType', { required: true, minLength: 2 })} /></Field>
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Button type="submit" primary disabled={busy} data-testid="button-save-appointment">{busy ? 'Salvando…' : 'Agendar atendimento'}</Button></div>
  </form>;
}
function AppointmentManager({ rangeMode = false }: { rangeMode?: boolean }) {
  const client = useQueryClient();
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const base = new Date();
  if (view === 'day') base.setDate(base.getDate() + offset);
  else if (view === 'week') base.setDate(base.getDate() + offset * 7);
  else base.setMonth(base.getMonth() + offset);
  const from = new Date(base); from.setHours(0, 0, 0, 0);
  if (view === 'week') from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
  if (view === 'month') from.setDate(1);
  const to = new Date(from);
  if (view === 'day') to.setDate(to.getDate() + 1);
  if (view === 'week') to.setDate(to.getDate() + 7);
  if (view === 'month') to.setMonth(to.getMonth() + 1);
  const params = useMemo(() => ({ from: from.toISOString(), to: to.toISOString() }), [from.toISOString(), to.toISOString()]);
  const appointments = useListAppointments(params, { query: { queryKey: getListAppointmentsQueryKey(params) } });
  const patients = useListPatients({}, { query: { queryKey: getListPatientsQueryKey({}) } });
  const create = useCreateAppointment();
  const update = useUpdateAppointment();
  const data = [...(appointments.data || [])].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const submit = (values: AppointmentInput | AppointmentUpdate) => {
    if (editing) update.mutate({ appointmentId: editing.id, data: values as AppointmentUpdate }, {
      onSuccess: async () => { await invalidate(client, [getListAppointmentsQueryKey(params), getGetDashboardQueryKey()]); setEditing(null); toast.success('Atendimento atualizado.'); },
      onError: () => toast.error('Não foi possível atualizar o atendimento.'),
    });
    else create.mutate({ data: values as AppointmentInput }, {
      onSuccess: async () => { await invalidate(client, [getListAppointmentsQueryKey(), getGetDashboardQueryKey()]); setCreating(false); toast.success('Atendimento agendado.'); },
      onError: () => toast.error('Não foi possível agendar.'),
    });
  };
  const setStatus = (appointment: Appointment, status: AppointmentUpdate['status']) => update.mutate({ appointmentId: appointment.id, data: { status } }, {
    onSuccess: async () => { await invalidate(client, [getListAppointmentsQueryKey(params), getGetDashboardQueryKey()]); toast.success('Situação atualizada.'); },
    onError: () => toast.error('Não foi possível atualizar o atendimento.'),
  });
  const days = Array.from({ length: view === 'day' ? 1 : view === 'week' ? 7 : new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate() }, (_, index) => { const d = new Date(from); d.setDate(d.getDate() + index); return d; });
  const pageTitle = rangeMode ? 'Atendimentos' : 'Agenda';
  return <><PageTitle title={pageTitle} subtitle={rangeMode ? 'Gerencie conclusão, cancelamento e faltas.' : 'Organize os compromissos da prática.'} action={<Button primary onClick={() => setCreating(true)} data-testid="button-new-appointment"><Plus size={16} />Novo atendimento</Button>} />
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 17 }}>
      <div style={{ display: 'flex', gap: 6 }}><Button className="btn-small" onClick={() => setOffset((n) => n - 1)} aria-label="Período anterior" data-testid="button-previous-period"><ChevronLeft size={15} /></Button><Button className="btn-small" onClick={() => setOffset(0)} data-testid="button-current-period">Hoje</Button><Button className="btn-small" onClick={() => setOffset((n) => n + 1)} aria-label="Próximo período" data-testid="button-next-period"><ChevronRight size={15} /></Button><b style={{ marginLeft: 8, alignSelf: 'center', fontSize: 13 }}>{new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(from)}</b></div>
      {!rangeMode && <div style={{ display: 'flex', background: '#eeede8', borderRadius: 10, padding: 3 }}>{(['day', 'week', 'month'] as const).map((v) => <button key={v} className="btn btn-small" style={{ border: 0, background: view === v ? '#fff' : 'transparent', boxShadow: view === v ? '0 1px 3px #0001' : 'none' }} onClick={() => { setView(v); setOffset(0); }} data-testid={`button-view-${v}`}>{v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Mês'}</button>)}</div>}
    </div>
    {appointments.isLoading || appointments.isError ? <QueryState loading={appointments.isLoading} error={appointments.isError} retry={() => void appointments.refetch()} /> :
      rangeMode ? <Panel title="Atendimentos no período"><AppointmentsTable appointments={data} onStatus={setStatus} /></Panel> :
      view === 'month' ? <Panel title="Visão mensal"><div className="calendar-grid">{['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((x) => <b className="muted" key={x} style={{ padding: 6, fontSize: 11 }}>{x}</b>)}{Array.from({ length: (from.getDay() + 6) % 7 }, (_, i) => <span key={`blank-${i}`} />)}{days.map((day) => <div className={`calendar-cell ${day.toDateString() === new Date().toDateString() ? 'today' : ''}`} key={day.toISOString()} data-testid={`calendar-day-${day.getDate()}`}><b>{day.getDate()}</b>{data.filter((a) => new Date(a.scheduledAt).toDateString() === day.toDateString()).slice(0, 2).map((a) => <span className="calendar-event" key={a.id}>{time(a.scheduledAt)} · {a.patientName}</span>)}</div>)}</div></Panel> :
      <div style={{ display: 'grid', gridTemplateColumns: view === 'day' ? '1fr' : 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>{days.map((day) => { const items = data.filter((a) => new Date(a.scheduledAt).toDateString() === day.toDateString()); return <Panel key={day.toISOString()} title={new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric' }).format(day)}>{items.length ? items.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} onStatus={setStatus} onEdit={setEditing} />) : <p className="muted" style={{ fontSize: 12, padding: '8px 0' }}>Sem atendimentos</p>}</Panel>; })}</div>}
    {creating && <Modal title="Novo atendimento" onClose={() => setCreating(false)} testId="modal-create-appointment"><AppointmentForm patients={patients.data || []} onSave={submit} busy={create.isPending} /></Modal>}
    {editing && <Modal title="Editar atendimento" onClose={() => setEditing(null)} testId="modal-edit-appointment"><AppointmentForm patients={patients.data || []} initial={editing} onSave={submit} busy={update.isPending} /></Modal>}
  </>;
}
function AppointmentCard({ appointment, onStatus, onEdit }: { appointment: Appointment; onStatus: (item: Appointment, status: AppointmentUpdate['status']) => void; onEdit: (item: Appointment) => void }) {
  return <div style={{ borderLeft: '3px solid #829b8b', padding: '9px 10px', background: '#f8f7f3', borderRadius: 8, marginBottom: 8 }} data-testid={`calendar-appointment-${appointment.id}`}><b style={{ fontSize: 12 }}>{time(appointment.scheduledAt)} · {appointment.patientName}</b><small style={{ display: 'block', color: '#858b85', margin: '3px 0 7px' }}>{appointment.appointmentType}</small><Status value={appointment.status} /><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}><Button className="btn-small" onClick={() => onEdit(appointment)} aria-label="Editar atendimento" data-testid={`button-edit-appointment-${appointment.id}`}>Editar</Button>{appointment.status !== 'completed' && <Button className="btn-small" onClick={() => onStatus(appointment, 'completed')} aria-label="Concluir atendimento" data-testid={`button-complete-${appointment.id}`}><Check size={12} /></Button>}{!['canceled', 'no_show'].includes(appointment.status) && <Button className="btn-small" onClick={() => onStatus(appointment, 'canceled')} data-testid={`button-cancel-${appointment.id}`}>Cancelar</Button>}{appointment.status !== 'no_show' && <Button className="btn-small" onClick={() => onStatus(appointment, 'no_show')} data-testid={`button-no-show-${appointment.id}`}>Falta</Button>}</div></div>;
}
function AppointmentsTable({ appointments, onStatus }: { appointments: Appointment[]; onStatus: (item: Appointment, status: AppointmentUpdate['status']) => void }) {
  if (!appointments.length) return <EmptyState title="Nenhum atendimento neste período" detail="Agende um compromisso para começar." />;
  return <div className="table-scroll"><table className="data-table"><thead><tr><th>Paciente</th><th>Data e hora</th><th>Tipo</th><th>Situação</th><th>Atualizar situação</th></tr></thead><tbody>{appointments.map((a) => <tr key={a.id} data-testid={`row-appointment-${a.id}`}><td>{a.patientName}</td><td>{shortDate(a.scheduledAt)} · {time(a.scheduledAt)}</td><td>{a.appointmentType}</td><td><Status value={a.status} /></td><td><select className="form-control" style={{ minWidth: 145 }} value={a.status} onChange={(event) => onStatus(a, event.target.value as AppointmentUpdate['status'])} aria-label={`Atualizar situação de ${a.patientName}`} data-testid={`select-status-${a.id}`}><option value="scheduled">Agendado</option><option value="confirmed">Confirmado</option><option value="completed">Concluído</option><option value="canceled">Cancelado</option><option value="no_show">Não compareceu</option></select></td></tr>)}</tbody></table></div>;
}
function AgendaPage() { return <AppointmentManager />; }
function AppointmentsPage() { return <AppointmentManager rangeMode />; }

function ReportsPage() {
  const year = new Date().getFullYear();
  const query = useGetReports({ year }, { query: { queryKey: getGetReportsQueryKey({ year }) } });
  const report = query.data;
  if (query.isLoading || query.isError) return <QueryState loading={query.isLoading} error={query.isError} retry={() => void query.refetch()} />;
  const max = Math.max(1, ...(report?.monthlySessions || []).map((item) => item.count));
  const metrics = [
    { Icon: Users, value: report?.activePatients ?? 0, label: 'Pacientes ativos' },
    { Icon: Archive, value: report?.archivedPatients ?? 0, label: 'Cadastros arquivados' },
    { Icon: Check, value: report?.sessionsThisYear ?? 0, label: 'Sessões neste ano' },
  ];
  return <><PageTitle title="Relatórios" subtitle="Indicadores administrativos agregados. Sem conteúdo de prontuário." />
    <div className="kpi-grid">{metrics.map(({ Icon, value, label }) => <section key={label} className="surface" data-testid={`report-metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="kpi-symbol"><Icon size={18} /></div><div className="kpi-value">{value}</div><span className="muted" style={{ fontSize: 12 }}>{label}</span></section>)}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(260px,.8fr)', gap: 18 }}><Panel title="Sessões por mês"><div style={{ display: 'flex', alignItems: 'end', gap: 12, height: 200, paddingTop: 16 }}>{report?.monthlySessions?.length ? report.monthlySessions.map((item) => <div key={item.month} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'end', alignItems: 'center', gap: 8 }} data-testid={`month-session-${item.month}`}><span className="muted" style={{ fontSize: 10 }}>{item.count}</span><div style={{ height: `${Math.max(4, item.count / max * 130)}px`, width: 'min(36px,75%)', background: '#829b8b', borderRadius: '7px 7px 2px 2px' }} /><small className="muted">{item.month}</small></div>) : <EmptyState title="Sem dados neste período" detail="As sessões serão agregadas por mês." />}</div></Panel>
      <Panel title="Atendimentos por situação">{report?.appointmentsByStatus?.length ? report.appointmentsByStatus.map((item) => <div className="row-list" key={item.status} data-testid={`report-status-${item.status}`}><div className="row-list-main"><Status value={item.status} /></div><b>{item.count}</b></div>) : <EmptyState title="Sem atendimentos registrados" detail="Os indicadores serão exibidos quando houver atividade." />}</Panel>
    </div>
  </>;
}

function DocumentsPage() {
  const client = useQueryClient();
  const query = useListDocuments({ query: { queryKey: getListDocumentsQueryKey() } });
  const patients = useListPatients({}, { query: { queryKey: getListPatientsQueryKey({}) } });
  const [busy, setBusy] = useState(false);
  const form = useForm<{ documentType: DocumentExportInput['documentType']; patientId: string; from: string; to: string }>({
    defaultValues: { documentType: 'attendance_declaration', patientId: '', from: '', to: '' },
  });
  const download = async (input: DocumentExportInput) => {
    setBusy(true);
    try {
      const blob = await exportDocument(input, { credentials: 'include' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `pensare-${input.documentType}.pdf`;
      link.click();
      URL.revokeObjectURL(objectUrl);
      await invalidate(client, [getListDocumentsQueryKey()]);
      toast.success('PDF autorizado gerado.');
    } catch {
      toast.error('Não foi possível gerar o documento. Confira sua autorização.');
    } finally { setBusy(false); }
  };
  return <><PageTitle title="Documentos" subtitle="Exporte documentos em PDF somente quando houver autorização." />
    <Panel title="Gerar PDF autorizado"><form onSubmit={form.handleSubmit((values) => void download({ documentType: values.documentType, patientId: values.patientId || null, from: values.from || null, to: values.to || null }))} data-testid="form-document-export">
      <div className="form-grid"><Field label="Tipo de documento"><select className="form-control" {...form.register('documentType')} data-testid="select-document-type"><option value="attendance_declaration">Declaração de comparecimento</option><option value="administrative_history">Histórico administrativo</option><option value="authorized_patient_record">Prontuário autorizado</option></select></Field><Field label="Paciente (quando aplicável)"><select className="form-control" {...form.register('patientId')} data-testid="select-document-patient"><option value="">Sem paciente específico</option>{patients.data?.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}</select></Field></div>
      <div className="form-grid"><Field label="De"><input type="date" className="form-control" {...form.register('from')} data-testid="input-document-from" /></Field><Field label="Até"><input type="date" className="form-control" {...form.register('to')} data-testid="input-document-to" /></Field></div>
      <Button primary type="submit" disabled={busy} data-testid="button-export-pdf"><Download size={15} />{busy ? 'Gerando PDF…' : 'Gerar e baixar PDF'}</Button>
      <p className="muted" style={{ fontSize: 11, marginBottom: 0 }}>O PDF é baixado diretamente. Nenhum link público permanente é criado.</p>
    </form></Panel>
    <div style={{ marginTop: 18 }}><Panel title="Documentos disponíveis">{query.isLoading || query.isError ? <QueryState loading={query.isLoading} error={query.isError} retry={() => void query.refetch()} /> : query.data?.length ? query.data.map((doc) => <div className="row-list" key={doc.id} data-testid={`document-${doc.id}`}><div className="kpi-symbol"><FileText size={17} /></div><div className="row-list-main"><b>{doc.title}</b><small>{doc.documentType} · {shortDate(doc.createdAt)}</small></div><Button className="btn-small" onClick={() => void download({ documentType: doc.documentType as DocumentExportInput['documentType'], patientId: doc.patientId })} disabled={busy} data-testid={`button-download-document-${doc.id}`}><Download size={14} />PDF</Button></div>) : <EmptyState title="Nenhum documento disponível" detail="Documentos criados ou autorizados serão listados aqui." />}</Panel></div>
  </>;
}
type ProfileFormValues = { displayName: string; professionalRegistration: string; clinicName: string; remindersEnabled: boolean; compactMode: boolean };
function SettingsPage() {
  const client = useQueryClient();
  const query = useGetProfile({ query: { queryKey: getGetProfileQueryKey() } });
  const update = useUpdateProfile();
  const form = useForm<ProfileFormValues>({ values: {
    displayName: query.data?.displayName || '', professionalRegistration: query.data?.professionalRegistration || '',
    clinicName: query.data?.clinicName || '', remindersEnabled: query.data?.preferences.remindersEnabled ?? true,
    compactMode: query.data?.preferences.compactMode ?? false,
  } });
  if (query.isLoading || query.isError) return <QueryState loading={query.isLoading} error={query.isError} retry={() => void query.refetch()} />;
  const save = form.handleSubmit((values) => {
    const payload: ProfessionalProfileUpdate = { ...values, professionalRegistration: values.professionalRegistration || null, clinicName: values.clinicName || null, preferences: { remindersEnabled: values.remindersEnabled, compactMode: values.compactMode } };
    update.mutate({ data: payload }, { onSuccess: async () => { await invalidate(client, [getGetProfileQueryKey()]); toast.success('Preferências atualizadas.'); }, onError: () => toast.error('Não foi possível salvar as preferências.') });
  });
  return <><PageTitle title="Configurações" subtitle="Informações profissionais e preferências de uso." /><div style={{ maxWidth: 760 }}><Panel title="Perfil profissional"><form onSubmit={save} data-testid="form-profile">
    <div className="form-grid"><Field label="Nome profissional"><input className="form-control" data-testid="input-profile-name" {...form.register('displayName', { required: true, minLength: 2 })} /></Field><Field label="Registro profissional"><input className="form-control" data-testid="input-profile-registration" {...form.register('professionalRegistration')} /></Field></div>
    <Field label="Nome da clínica"><input className="form-control" data-testid="input-profile-clinic" {...form.register('clinicName')} /></Field>
    <div className="row-list"><div className="row-list-main"><b>Lembretes de sessão</b><small>Ativar lembretes na rotina de atendimentos</small></div><input type="checkbox" aria-label="Lembretes de sessão" {...form.register('remindersEnabled')} data-testid="toggle-reminders" /></div>
    <div className="row-list"><div className="row-list-main"><b>Modo compacto</b><small>Usar listas com menos espaçamento</small></div><input type="checkbox" aria-label="Modo compacto" {...form.register('compactMode')} data-testid="toggle-compact-mode" /></div>
    <div style={{ marginTop: 20 }}><Button primary type="submit" disabled={update.isPending} data-testid="button-save-profile">{update.isPending ? 'Salvando…' : 'Salvar alterações'}</Button></div>
  </form></Panel></div></>;
}
function SecurityPage() {
  const params = { limit: 100 };
  const query = useListAuditEvents(params, { query: { queryKey: getListAuditEventsQueryKey(params) } });
  return <><PageTitle title="Segurança" subtitle="Acompanhe eventos de acesso e alterações administrativas." />
    <Panel title="Trilha de auditoria"><p className="muted" style={{ fontSize: 12, marginTop: -6 }}>Por privacidade, detalhes clínicos não são exibidos nos resumos de auditoria.</p>{query.isLoading || query.isError ? <QueryState loading={query.isLoading} error={query.isError} retry={() => void query.refetch()} /> : query.data?.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Evento</th><th>Tipo</th><th>Registro</th><th>Quando</th></tr></thead><tbody>{query.data.map((event) => <tr key={event.id} data-testid={`audit-event-${event.id}`}><td><b>{event.eventType.replaceAll('_', ' ')}</b><small className="muted" style={{ display: 'block' }}>Ação registrada no sistema</small></td><td>{event.entityType}</td><td>{event.entityId ? `${event.entityType} · identificador restrito` : '—'}</td><td>{shortDate(event.occurredAt)} · {time(event.occurredAt)}</td></tr>)}</tbody></table></div> : <EmptyState title="Nenhum evento registrado" detail="Eventos de acesso serão listados nesta trilha." />}</Panel>
    <div className="surface" style={{ display: 'flex', alignItems: 'center', gap: 13, marginTop: 16 }}><div className="kpi-symbol"><ShieldCheck size={19} /></div><div><b>Área autenticada</b><p className="muted" style={{ margin: '3px 0 0', fontSize: 12 }}>Acesso a dados clínicos depende de sessão profissional autenticada.</p></div></div>
  </>;
}
function RoutedPage({ path, page }: { path: string; page: ReactNode }) {
  return <Route path={path}><Protected><AppShell>{page}</AppShell></Protected></Route>;
}
function Router() {
  return <Switch>
    <Route path="/" component={HomeRedirect} />
    <Route path="/sign-in/*?" component={AuthFrame} />
    <Route path="/sign-up/*?" component={AuthFrame} />
    <RoutedPage path="/dashboard" page={<DashboardPage />} />
    <RoutedPage path="/patients" page={<PatientsPage />} />
    <Route path="/patients/:id"><Protected><AppShell><PatientDetailPage /></AppShell></Protected></Route>
    <RoutedPage path="/records" page={<RecordsPage />} />
    <RoutedPage path="/agenda" page={<AgendaPage />} />
    <RoutedPage path="/appointments" page={<AppointmentsPage />} />
    <RoutedPage path="/reports" page={<ReportsPage />} />
    <RoutedPage path="/documents" page={<DocumentsPage />} />
    <RoutedPage path="/settings" page={<SettingsPage />} />
    <RoutedPage path="/security" page={<SecurityPage />} />
    <Route component={NotFound} />
  </Switch>;
}
function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in the environment.');
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={appearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{ signIn: { start: { title: 'Boas-vindas de volta', subtitle: 'Entre para acessar sua prática.' } }, signUp: { start: { title: 'Comece com Pensare', subtitle: 'Crie seu espaço profissional com segurança.' } } }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <Switch><Route path="/sign-in/*?"><AuthFrame /></Route><Route path="/sign-up/*?"><AuthFrame /></Route><Route><ClerkCacheReset /><Router /></Route></Switch>
      <Toaster />
    </QueryClientProvider>
  </ClerkProvider>;
}
function App() {
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}
export default App;
