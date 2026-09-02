# Publicação na Google Play Store — LYVEN

Tudo o que a ficha da Play Store precisa está preparado nesta pasta `play-store/`.

## Dados do pacote

| Campo | Valor |
|---|---|
| Nome da app | LYVEN |
| Package name | `app.rork.lyven_events` |
| Version name | 1.0.3 |
| Version code | 3 (definido em `expo/app.json` → `expo.android.versionCode`) |
| Idioma da ficha | pt-PT |

Nota: a Google **não permite criar uma app nova via API** — o registo tem de ser criado manualmente na Play Console.

## Ficheiros preparados

| Recurso | Caminho | Especificação |
|---|---|---|
| Descrições | `play-store/metadata/pt-PT.json` | título 26/30, breve 65/80, completa 1511/4000 + notas da versão |
| Ícone | `play-store/images/icon-512.png` | 512×512 PNG, 24 KB (limite 1 MB) |
| Recurso gráfico | `play-store/images/feature-graphic.png` | 1024×500 PNG, 608 KB (limite 15 MB) |
| Capturas telefone (4) | `play-store/images/phone/` | 1080×1920 (9:16), ≤2,5 MB |
| Capturas tablet 7" (4) | `play-store/images/tablet7/` | mesmas do telefone (válido: mesma proporção/limites) |
| Capturas tablet 10" (4) | `play-store/images/tablet10/` | 1920×1080 (16:9), ≤2,9 MB |

As capturas foram geradas a partir do design real da app (teal #0099a8, ecrãs Explorar/Bilhetes/Mapa/Dashboard). Para um toque ainda mais autêntico pode substituí-las por capturas reais do dispositivo mais tarde — o formato já fica validado.

## `.env` para a Google

Não é necessário nenhum `.env` específico para a Google Play. O que existe:

- **Para compilar a app**: o `expo/.env` do projeto já contém tudo (chaves `EXPO_PUBLIC_*`, que são públicas por definição). O `play-store/.env.example` documenta essas chaves para replicar noutro ambiente.
- **Segredos** (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `RESEND_API_KEY`…): ficam só no backend (Supabase/Edge Functions). **Nunca** os incluir no build — a Google não os precisa.

## Passos na Play Console (manuais)

1. **Criar a app**: play.google.com/console → "Criar app" → nome LYVEN, idioma Português (Portugal), app (não jogo), gratuito.
2. **Ficha da loja**: colar os textos de `metadata/pt-PT.json` e carregar as imagens de `images/`.
3. **Contactos**: email de suporte (obrigatório) e URL da política de privacidade (obrigatório — pode apontar para uma página no site LYVEN).
4. **Classificação de conteúdo**: questionário — sem violência/sexo/apostas/linguagem forte; interação de utilizadores (compradores/promotores) → preencher de acordo.
5. **Segurança dos dados**: declarar recolha de nome, email, localização (aproximada/precisa para eventos próximos), informação de compra (bilhetes) e dados de conta. Sem partilha para marketing. Eliminação de dados = eliminação de conta (já implementada).
6. **Anúncios**: a app mostra anúncios próprios de promotores — responder "Sim, contém anúncios".
7. **Público-alvo**: 13+ ou 18+ (recomendado 18+, eventos noturnos).

## Compilar e publicar o AAB

1. **Build**: o serviço de builds Play AAB da plataforma cobre apps Kotlin; para esta app Expo usar `npx expo prebuild -p android` + `cd android && ./gradlew bundleRelease` (a Rork injecta automaticamente a upload key persistente ao exportar o AAB), ou EAS Build com conta própria.
2. **Ligar a conta Google**: no diálogo de publicação do projeto, "Connect Google Play" (OAuth — sem chaves de serviço no chat/repo).
3. **Primeira publicação**: track de **teste interno** com o AAB + notas de versão (`metadata/pt-PT.json` → `releaseNotes`) → validar → promover para produção.
4. Após a primeira publicação, posso automatizar: atualização da ficha (textos/imagens), promoção de tracks e rollout faseado via API.

## Notas de conformidade

- A venda de bilhetes para eventos reais é um serviço físico — **não requer Google Play Billing** (pagamentos processados fora, via checkout existente).
- Permissões de alto escrutínio não usadas foram removidas do `app.json` (`REQUEST_INSTALL_PACKAGES`, `RECORD_AUDIO`) para reduzir risco de rejeição.
- Antes de publicar, apagar os eventos de teste pendentes no painel de admin ("Hahhehehe", "Testes", "Teste", "exemplo").
