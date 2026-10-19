# Árvore Viva — Inteligência Genealógica

Plataforma web para construir, documentar, pesquisar e explorar árvores genealógicas, com vínculos biológicos, legais e adotivos, documentos e fontes, análise explicável de possíveis parentes e visualização interativa em **2D e 3D**.

> Todos os dados de demonstração são fictícios. Nenhum CPF, documento ou pessoa real é usado como exemplo.

## Como rodar (5 minutos)

Requisitos: **Node.js 22.13 ou mais novo** (não precisa de banco de dados separado).

```bash
npm install          # instala three (3D) e leaflet (mapa)
cp .env.example .env # opcional em desenvolvimento
npm start            # abre em http://localhost:3000
```

1. Crie uma conta.
2. Clique em **Carregar demonstração** para ver uma família fictícia com 5 gerações, documentos, evidências e correspondências.
3. Ou crie sua árvore e adicione a primeira pessoa.

Testes automatizados: `npm test`.

## O que já funciona

Veja a lista completa e honesta em [docs/FUNCIONALIDADES.md](docs/FUNCIONALIDADES.md). Em resumo:

- Contas com senha forte (scrypt), sessões seguras, proteção CSRF, limite de tentativas e bloqueio temporário.
- Árvores com papéis (proprietário, administrador, editor, colaborador, leitor), convites com expiração e revogação.
- Pessoas independentes da árvore (podem estar em várias árvores sem duplicar), nomes alternativos, eventos de vida, vínculos de filiação biológica/legal/adotiva/criação, tutela, casamentos e uniões (inclusive encerradas), irmandade e parentesco a confirmar.
- Verificação de duplicidade antes de cadastrar, comparação lado a lado e união de registros só com confirmação explícita.
- Árvore 2D (vertical, horizontal, ascendentes, descendentes, gerações, radial, rede, linhagem) com zoom, arraste, teclado, filtros, recolher ramos, caminho de parentesco e histórico. Desenha só a parte visível (testado com 3.000 pessoas).
- Árvore 3D (Three.js, carregada sob demanda) com os mesmos dados, seleção e filtros; câmera livre ou focada; alternância 2D↔3D sem perder o contexto.
- Pesquisa tolerante a acentos, erros de digitação e grafias (Souza/Sousa), com filtros combináveis.
- Cálculo de parentesco em português (avô, prima de 2º grau afastada 1 geração, meio-irmão, cunhado…) com o caminho completo e alternativas.
- Correspondências explicáveis com 6 categorias, fatores a favor/contra/faltantes e revisão humana (aceitar, rejeitar, adiar, desfazer, histórico).
- Documentos criptografados, verificação do tipo real do arquivo, links temporários, níveis de acesso, vínculo a pessoas/relações/eventos, grafo de evidências e extração assistida (texto de PDF ou transcrição) para revisão.
- CPF opcional com validação dos dígitos, criptografado, mascarado, visível por completo só para administradores (auditado).
- Linha do tempo, mapa (OpenStreetMap) sem inventar coordenadas, relatórios para impressão/PDF e CSV, importação/exportação GEDCOM, CSV e JSON com prévia.
- Temas claro e escuro, layout para celular, navegação por teclado, respeito a "reduzir movimento".

## Documentação

- [Arquitetura](docs/ARQUITETURA.md)
- [Implantação, variáveis de ambiente, backup e restauração](docs/IMPLANTACAO.md)
- [Funcionalidades concluídas e pendências](docs/FUNCIONALIDADES.md)
