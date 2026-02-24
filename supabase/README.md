# Supabase Migrations

## Como executar as migrations

As migrations devem ser executadas diretamente no Supabase SQL Editor:

1. Acesse o painel do Supabase em https://supabase.com/dashboard
2. Navegue ate o projeto `mdzfsfeagqtlimgenzso`
3. Va em **SQL Editor**
4. Copie e cole o conteudo do arquivo de migration desejado
5. Execute

### Migrations disponiveis

| Arquivo | Descricao |
|---------|-----------|
| `20260223_progrowth_clients.sql` | Cria tabela `progrowth_clients` para o agente ProGrowth com RLS |

**Nota:** A tabela usa RLS (Row Level Security). Se o app nao usa `auth.uid()` (login via mock user), a policy pode precisar de ajuste ou ser desabilitada temporariamente para funcionar com usuarios nao-autenticados via Supabase Auth.
