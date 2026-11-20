# Pensare

Sistema web para organizar a rotina de profissionais de psicologia: pacientes, prontuários, agenda, relatórios administrativos, exportações em PDF e trilha de auditoria.

## Desenvolvimento

- A prévia usa o serviço web `artifacts/pensare` e a API compartilhada `artifacts/api-server`.
- O banco PostgreSQL do ambiente de desenvolvimento já contém as tabelas e políticas RLS do Pensare.
- Execute `pnpm run typecheck` para verificar os pacotes do workspace.
- O servidor de API exige `DATABASE_URL`, as chaves Clerk gerenciadas pelo Replit e `SESSION_SECRET` para cifrar os campos clínicos.
- Use exclusivamente dados fictícios durante desenvolvimento e validação.

## Proteções implementadas

- Rotas autenticadas com Clerk e escopo por profissional.
- RLS aplicado às tabelas do Pensare e consultas limitadas ao profissional autenticado.
- Campos clínicos cifrados com AES-256-GCM usando chave derivada de segredo externo ao banco.
- Registros finalizados ficam imutáveis; retificações criam versões com justificativa.
- Auditoria sem conteúdo clínico, limite de requisições, validação de origem e cabeçalhos de segurança.
- PDFs são gerados sob autenticação, transmitidos sem URL pública permanente e registrados na auditoria.
- Exportação de prontuário inclui apenas registros psicológicos finalizados; documentos restritos não são incluídos.

## Antes de usar dados reais

Este projeto não declara conformidade jurídica com a LGPD nem está validado para uso clínico em produção. Ainda são necessários revisão técnica e jurídica, confirmação da política de MFA e sessões do Clerk, validação de retenção e recuperação, gestão/rotação da chave de cifragem e testes de isolamento em ambiente controlado. Não publique nem armazene dados reais de pacientes até concluir essas etapas.