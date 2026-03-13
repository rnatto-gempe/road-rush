# ROAD RUSH — Game Design Document

**Versão 2.0 • Março 2026**

*Minimalista • Arcade • Corrida Vertical • Leaderboard Online*

> Inspirado em Road Fighter (Konami, 1984)

---

## 1. Visão Geral

**Título:** Road Rush
**Gênero:** Arcade Racing / Endless Runner Vertical
**Plataforma:** Web (Canvas/WebGL), Mobile (PWA)
**Controles:** Touch / Teclado / Gamepad
**Sessão Média:** 45–120 segundos (design intencional)
**Referência Principal:** Road Fighter (Konami, 1984)

### Pitch em Uma Frase

Pilote em alta velocidade por uma rodovia infinita, desviando de tráfego e coletando combustível, em uma experiência arcade minimalista que escala em dificuldade a cada segundo — projetada para matar você rápido e fazer você tentar de novo.

### Pilares de Design

| Pilar | Significado | Impacto na Jogabilidade |
|-------|-------------|------------------------|
| Reflexo Puro | Zero menus, zero upgrades — só habilidade | O jogador entra no jogo em < 3 segundos |
| Tensão Crescente | Dificuldade sobe suavemente sem teto | Garante que toda sessão termina (e motiva retry) |
| Feedback Tátil | Cada ação tem resposta visual + sonora imediata | Sensação de controle total do veículo |
| One More Run | Sessões curtas, loop de retry instantâneo | Alta retenção por micro-sessões viciantes |
| Competição Social | Leaderboard global em tempo real | Motivação extrínseca + comparação com pares |

---

## 2. Mecânicas Core

### 2.1 Movimento do Jogador

O veículo do jogador ocupa uma pista vertical com scrolling contínuo para baixo. O jogador controla apenas o eixo horizontal (esquerda/direita) com aceleração analógica.

| Parâmetro | Valor | Notas |
|-----------|-------|-------|
| Velocidade lateral | Analógica (0–100%) | Proporcional ao input (touch: distância do dedo; teclado: hold progressivo) |
| Velocidade lateral máx | 400 px/s | Base; pode ser reduzida por terreno |
| Aceleração lateral | 1200 px/s² | Responsivo mas não teleporte |
| Desaceleração (sem input) | 1800 px/s² | Retorno rápido ao centro de inércia |
| Largura do carro | 40 px (unidade lógica) | ~12% da largura da pista |
| Hitbox | 80% da sprite | Colisões perdoam levemente (coyote frames espacial) |

> 🎮 **GAME FEEL:** A hitbox menor que a sprite implementa o conceito de "generous collision" — o jogador sente que escapou por pouco em vez de morrer injustamente. Esse gap entre percepção visual e mecânica gera sensação de maestria.

### 2.2 Scrolling & Velocidade

A pista rola de cima para baixo. A velocidade de scroll representa a velocidade do jogador e é o principal vetor de dificuldade.

| Estado | Velocidade de Scroll | Condição |
|--------|---------------------|----------|
| Início | 200 px/s | Primeiros 5 segundos |
| Cruzeiro | 200 + (tempo × 5) px/s | Rampa linear agressiva |
| Cap Soft | 600 px/s | Após ~80s — rampa reduz para +1.5/s |
| Cap Hard | 800 px/s | Máximo absoluto |
| Após colisão leve | -40% por 1.5s | Penalidade de velocidade |
| Boost (item) | +30% por 3s | Coletável de nitro |

### 2.3 Combustível

O combustível é o timer de sessão e o mecanismo central de pressão. Ele drena constantemente e acaba = game over. O design intencional de consumo garante que mesmo sem colisões, o jogador eventualmente morre — isso é feature, não bug.

| Parâmetro | Valor |
|-----------|-------|
| Tanque inicial | 100 unidades |
| Consumo base | 3 u/s (agressivo por design) |
| Consumo em velocidade alta (>500px/s) | 4.5 u/s |
| Reabastecimento (item Fuel) | +20 u (nunca enche o tanque — escassez intencional) |
| Spawn rate do Fuel | A cada 900–1400 px percorridos (sobe com dificuldade) |
| Posição do item | Aleatória dentro da pista (frequentemente em posições arriscadas) |

> 🎯 **DESIGN INTENT:** O fuel funciona como um "death clock" — mesmo jogadores perfeitos têm tempo limitado. Isso cria uma janela de sessão de ~60-90s para jogadores médios e ~120s para experts. A escassez intencional de fuel força o jogador a correr riscos para coletar, gerando tensão constante.

---

## 3. Obstáculos e Tráfego

### 3.1 Tipos de Veículos (Tráfego)

| Tipo | Cor | Comportamento | Frequência |
|------|-----|---------------|------------|
| Caminhão | Cinza escuro | Lento, ocupa 1.5× largura, previsível | Comum desde o início |
| Sedan | Azul | Velocidade média, mantém faixa | Comum |
| Esportivo | Vermelho | Rápido, muda de faixa aleatoriamente | Raro no início, comum após 40s |
| Moto | Amarelo | Muito rápida, hitbox pequena, weave entre faixas | Rara, surge após 60s |

### 3.2 Spawn de Tráfego

| Tempo de Jogo | Veículos Simultâneos (máx) | Intervalo entre Spawns |
|---------------|---------------------------|----------------------|
| 0–20s | 2 | 1200–1600 px |
| 20–40s | 3 | 800–1200 px |
| 40–70s | 4 | 600–900 px |
| 70s+ | 5 | 400–700 px |

*O sistema usa um algoritmo de spawn com constraint: nunca bloquear 100% da pista. Sempre deve existir pelo menos 1 gap de 1.5× largura do jogador passável entre obstáculos no mesmo Y.*

> ⚖️ **FAIRNESS PRINCIPLE:** O spawn constraint é a "promessa implícita" ao jogador: toda morte é justa. Se o jogador morrer, é porque errou — não porque o jogo gerou uma situação impossível. Isso é fundamental para o retry loop: o jogador aceita a morte e tenta de novo porque sabe que pode melhorar.

### 3.3 Colisões

| Tipo de Colisão | Efeito | Visual |
|-----------------|--------|--------|
| Raspão lateral (overlap < 30%) | Slow 20% por 0.8s, spark VFX | Faíscas + screen shake leve |
| Colisão frontal (overlap >= 30%) | Slow 40% por 1.5s, -15 fuel | Flash vermelho + shake forte |
| Colisão com borda da pista | Slow 30% por 1s | Poeira + vibração haptic |
| Colisão fatal (velocidade > 600 + frontal) | Instant game over | Explosão minimalista |

> 💀 **LETHALITY WINDOW:** O threshold de colisão fatal baixou de 700 para 600 px/s. Como a velocidade agora sobe mais rápido (×5 em vez de ×3), o jogador entra na zona de perigo mais cedo — cada colisão após ~80s pode ser fatal, criando tensão extrema na fase final.

---

## 4. Itens Coletáveis

| Item | Ícone | Efeito | Spawn |
|------|-------|--------|-------|
| Fuel | Gota verde | +20 combustível | Regular (900–1400 px) |
| Nitro | Raio amarelo | +30% velocidade por 3s + invulnerabilidade | Raro (2500–4000 px) |
| Coin | Círculo dourado | +100 pontos | Frequente, em clusters de 3–5 |
| Shield | Hexágono azul | Absorve 1 colisão (some após uso) | Muito raro (5000+ px) |

*Itens são coletados por sobreposição de hitbox. Feedback: scale up 120% → fade out em 0.2s + SFX correspondente + score popup flutuante.*

> 🗺️ **RISK/REWARD GEOGRAPHY:** Itens de fuel são intencionalmente posicionados em zonas de risco (perto de tráfego, perto das bordas). Isso implementa o conceito de "risk/reward geography" — o mapa em si apresenta micro-dilemas: desviar do tráfego de forma segura OU arriscar para pegar o fuel que vai estender sua run.

---

## 5. Sistema de Pontuação

| Ação | Pontos | Notas |
|------|--------|-------|
| Distância percorrida | 1 pt / 10 px | Score base |
| Near miss (passar rente a tráfego) | +50 pts | Gap < 20px sem colisão |
| Combo near miss (sequência) | 50 × combo multiplier | Reset ao colidir ou 3s sem near miss |
| Coin coletada | +100 pts | Fixo |
| Ultrapassagem limpa | +25 pts | Passar veículo sem qualquer slow |
| Sobreviver 30s sem colisão | +300 pts (bonus) | Notificação especial (mais frequente = mais dopamina) |

O near miss é o multiplicador de skill. Jogadores avançados buscam maximizar combos passando rente ao tráfego. Isso cria um risk/reward natural: quanto mais perto, mais pontos — mas maior chance de colisão.

> 📈 **SKILL CEILING:** O sistema de scoring implementa "skill ceiling amplification": o score base (distância) define um piso, mas near miss combos definem o teto. Dois jogadores que sobrevivem o mesmo tempo podem ter scores 3–5× diferentes. Isso mantém o leaderboard interessante mesmo para jogadores de nível similar e recompensa play styles agressivos.

---

## 6. Design de Dificuldade

Esta seção é o coração do game design de Road Rush. A dificuldade não é um slider — é uma experiência cuidadosamente orquestrada que deve fazer o jogador sentir que está sempre no limite, mas nunca trapaceado.

### 6.1 Filosofia: A Janela dos 90 Segundos

Road Rush é projetado para uma janela de sessão intencional:

| Perfil do Jogador | Tempo de Sobrevivência | Experiência |
|--------------------|----------------------|-------------|
| Primeira vez | 15–30 segundos | Aprende mecânicas, morre rápido, entende o loop |
| Casual (5–10 runs) | 30–60 segundos | Começa a desviar consistentemente, descobre near miss |
| Intermediário (20+ runs) | 60–90 segundos | Otimiza coleta de fuel, busca combos |
| Expert (100+ runs) | 90–120 segundos | Maximiza near miss, conhece padrões, score hunting |
| Teórico máximo | ~150 segundos | Com fuel perfeito + shield + sorte — barreira natural |

> 🕹️ **BUSHNELL'S LAW:** Essa janela curta é inspirada no conceito de Bushnell's Law (atribuído a Nolan Bushnell, fundador da Atari): um jogo deve ser fácil de aprender e difícil de dominar. A morte rápida nas primeiras runs é feature: ensina pelo fracasso e reduz o custo emocional de cada retry. O jogador pensa "foram só 20 segundos, posso tentar de novo" — e esse é exatamente o hook.

### 6.2 Os Quatro Atos da Sessão

Cada run tem uma estrutura dramática implícita em 4 atos, inspirada no conceito de pacing narrativo aplicado a gameplay:

| Ato | Tempo | Emoção | Mecânica Dominante | Game Design Concept |
|-----|-------|--------|--------------------|---------------------|
| I — Tutorial Orgânico | 0–20s | Curiosidade, segurança | Poucos veículos lentos, fuel generoso, espaço amplo | Scaffolding: aprende sem tutorial explícito |
| II — Engajamento | 20–50s | Confiança crescente, flow | Tráfego aumenta, esportivos surgem, primeiros near misses | Flow Channel: desafio = habilidade |
| III — Crise | 50–80s | Tensão, decisões rápidas | Motos surgem, fuel escasso, faixas apertadas, velocidade alta | Stress Inoculation: pressão controlada |
| IV — Clímax | 80s+ | Adrenalina, survival mode | Tráfego máximo, fuel crítico, zona de morte por colisão | Peak-End Rule: o final define a memória |

> 🧠 **PEAK-END RULE:** A Peak-End Rule (Kahneman, 1993) diz que as pessoas julgam uma experiência pelo seu pico emocional e pelo final, não pela média. Em Road Rush, o Ato IV é projetado para ser o pico: se o jogador morre no clímax — a memória é intensa. Isso é o que faz ele apertar "retry".

### 6.3 Curvas de Dificuldade: Multi-Axis Scaling

A dificuldade não vem de um único parâmetro — ela escala em múltiplos eixos simultaneamente, cada um com sua curva. Isso evita que o jogador "resolva" a dificuldade adaptando-se a uma única variável.

| Eixo de Dificuldade | 0s | 30s | 60s | 90s+ | Curva |
|----------------------|----|-----|-----|------|-------|
| Scroll speed (px/s) | 200 | 350 | 500 | 700+ (cap 800) | Linear → Log |
| Tráfego simultâneo | 2 | 3 | 4 | 5 | Step |
| Intervalo spawn (px) | 1400 | 1000 | 700 | 500 | Linear inverso |
| % Tipos agressivos | 0% | 15% | 35% | 60% | Exponencial |
| Fuel spawn interval | 1000 | 1100 | 1250 | 1400 | Linear (mais escasso) |
| Fuel por coleta | 20 | 20 | 18 | 15 | Step down |
| Consumo fuel (u/s) | 3 | 3.5 | 4 | 4.5 | Linear |
| Velocidade lateral inimigos | 0 | 0 | Lenta | Média | Step |
| Morte por colisão? | Não | Não | Possível | Provável | Threshold |

> 🧩 **LAYERED DIFFICULTY:** O scaling multi-eixo implementa o princípio de "layered difficulty" — cada eixo sobe em um ritmo diferente, criando momentos onde o jogador sente que "deu conta" de um desafio novo mas logo é confrontado com outro. Isso mantém a experiência fresca mesmo em runs consecutivas e evita o "wall effect" onde tudo fica difícil de uma vez.

### 6.4 Rubber Banding Invertido

Ao contrário de jogos de corrida tradicionais (que usam rubber banding para ajudar quem está atrás), Road Rush usa o conceito inverso: quanto melhor você está jogando, mais o jogo pressiona. Isso é implementado de forma sutil:

- Cada 10 segundos sem colisão: +5% na velocidade de spawn de tráfego (recompensa de sobrevivência vira pressão)
- Combo de near miss ativo: inimigos spawnam 10% mais perto (o jogo reage ao skill do jogador)
- Fuel acima de 70%: próximo fuel spawna 20% mais longe (penaliza safety play, incentiva risco)

> 📊 **DYNAMIC DIFFICULTY:** Esse sistema implementa "Dynamic Difficulty Adjustment" (DDA) de forma unidirecional: ele só sobe, nunca desce. Isso é intencional. O jogo sempre termina. A questão não é SE você morre, mas QUANDO e COM QUAL SCORE. Essa inevitabilidade é liberadora — remove a frustração de "quase consegui" e substitui por "vou bater meu recorde".

### 6.5 Padrões de Spawn (Pattern Language)

O tráfego não é puramente aleatório. O sistema usa uma biblioteca de padrões pré-definidos que são selecionados com base na dificuldade atual. Isso garante que o jogador enfrenta situações legíveis e justas:

| Padrão | Descrição | Aparece em | Skill Testada |
|--------|-----------|------------|---------------|
| Corredor | 2 veículos lado a lado com gap central | Ato I+ | Posicionamento básico |
| Slalom | 3 veículos alternados em zigue-zague | Ato II+ | Timing de mudança de faixa |
| Muro com Brecha | 4 veículos com 1 gap estreito | Ato III+ | Precisão sob pressão |
| Perseguição | 1 esportivo atrás + tráfego na frente | Ato III+ | Gestão de múltiplas ameaças |
| Funil | Tráfego converge para centro, gap nas bordas | Ato IV | Nerve — ir contra o instinto |
| Armadilha de Fuel | Fuel entre 2 caminhões se fechando | Ato III+ | Risk assessment em tempo real |

> 🎲 **AUTHORED RANDOMNESS:** Padrões pré-definidos implementam o conceito de "Authored Randomness" — o jogo parece procedural mas usa um vocabulário de situações testadas. Cada padrão tem uma solução clara (fairness) mas requer execução precisa (challenge). A seleção do padrão é ponderada pela dificuldade atual, garantindo progressão orgânica.

### 6.6 O Death Spiral (e como evitá-lo)

Um problema clássico de jogos com dificuldade crescente é o "death spiral": o jogador comete um erro, o que o coloca em posição pior, o que causa mais erros. Road Rush mitiga isso conscientemente:

| Problema (Death Spiral) | Mitigação |
|-------------------------|-----------|
| Colisão reduz velocidade → perde fuel mais rápido | Slow down também reduz consumo de fuel proporcionalmente (hidden mercy) |
| Perder fuel → forçar risco → mais colisões | Após colisão, 1.5s de "breathing room" com spawn pause local |
| Perder combo → frustração → tilt | Combo counter desaparece suavemente (não mostra "0×", evita feedback negativo) |
| Velocidade alta demais → impossível reagir | Lateral speed escala com scroll speed (controle proporcional) |
| Tráfego fecha tudo → morte injusta | Constraint de fairness: sempre existe 1 gap passável |

> 🛡️ **HIDDEN MERCY:** O conceito de "hidden mercy mechanics" vem do design de jogos como Celeste e Hollow Knight: o jogo é mais generoso do que aparenta. O jogador sente que sobreviveu por skill, mas o sistema deu uma ajuda invisível. Isso é crucial para a sensação de "quase morri" que gera adrenalina.

### 6.7 Cadência de Dopamina

O jogo distribui micro-recompensas em intervalos calibrados para manter o engajamento constante:

| Recompensa | Frequência | Intensidade do Feedback | Função Psicológica |
|------------|------------|------------------------|-------------------|
| Coin coletada | ~cada 3–5s | Baixa (blip + número) | Reforço contínuo / variable ratio |
| Near miss | ~cada 8–15s (se arriscando) | Média (swoosh + combo) | Dopamina de risco recompensado |
| Fuel coletado | ~cada 15–25s | Alta (relief + glow) | Alívio de tensão (tension-release cycle) |
| Novo personal best | Variável | Muito alta (flash especial) | Peak emotion / milestone |
| Bonus de sobrevivência | Cada 30s | Alta (fanfarra curta) | Checkpoint emocional |

> 🎰 **REINFORCEMENT SCHEDULE:** A distribuição de recompensas segue um modelo de "variable ratio reinforcement schedule" (Skinner) — a mais poderosa forma de condicionamento operante. Near misses e coins não vêm em intervalos fixos; eles dependem do comportamento do jogador. Isso cria o mesmo loop que faz slot machines serem viciantes, mas aplicado a habilidade real em vez de sorte.

---

## 7. Controles

### 7.1 Mapeamento

| Input | Ação |
|-------|------|
| Touch: arrastar horizontalmente | Mover carro (posição relativa ao dedo) |
| Touch: tap duplo | Ativar nitro (se disponível no inventário) |
| Teclado: ← → | Mover esquerda/direita (hold = aceleração progressiva) |
| Teclado: Espaço | Ativar nitro |
| Gamepad: Analógico esquerdo | Mover (analógico proporcional) |
| Gamepad: Botão A/X | Ativar nitro |
| Qualquer input no Game Over | Retry instantâneo (< 300ms) |

### 7.2 Filosofia de Controle

O controle deve ser absurdamente responsivo. Input lag > 1 frame é inaceitável. O jogador nunca deve sentir que morreu por culpa do controle. A inércia lateral existe para dar peso, mas nunca para frustrar.

> ⚡ **INSTANT RETRY:** O retry instantâneo é possivelmente a feature mais importante do jogo. Citando Vlambeer (Nuclear Throne): "O tempo entre morrer e jogar de novo é o tempo que o jogador tem para desistir." Em Road Rush, esse tempo é < 300ms — um tap e está de volta na pista. Zero loading, zero tela de retry elaborada.

---

## 8. Interface (HUD)

O HUD é minimal. Apenas informação essencial, sempre visível sem obstruir a pista.

| Elemento | Posição | Estilo |
|----------|---------|--------|
| Score | Topo-direita | Número grande, branco, sombra sutil |
| Barra de Fuel | Topo, largura total | Barra fina (4px), verde→amarelo→vermelho |
| Combo counter | Centro-topo | Aparece só durante combo, fade após 3s |
| Velocidade (opcional) | Canto inferior-direito | Texto pequeno, baixa opacidade |
| Shield indicator | Ao redor do carro | Borda brilhante hexagonal |
| Ranking position hint | Canto superior-esquerdo | Mostra posição atual vs leaderboard em tempo real |

### Telas do Jogo

| Tela | Conteúdo | Transição |
|------|----------|-----------|
| Title | Logo + "Tap to Start" pulsante + Top 5 leaderboard | Fade out 0.3s → jogo |
| Gameplay | Pista + HUD + ranking hint | — |
| Game Over | Score, best score, posição no ranking, "Tap to Retry" | Slide up 0.2s, retry = instant |
| Leaderboard | Top 20 global, acessível da title screen | Slide lateral |

---

## 9. Estilo Visual

### 9.1 Direção Artística

Flat design ultra-minimalista. Formas geométricas simples, sem texturas. Paleta reduzida. O visual é funcional: cada cor tem significado gameplay.

| Elemento | Cor / Estilo |
|----------|-------------|
| Fundo (asfalto) | `#1A1A2E` → `#16213E` (gradiente vertical sutil) |
| Faixas da pista | `#FFFFFF` com 40% opacidade, tracejadas |
| Carro do jogador | Retângulo arredondado, vermelho (`#E53935`) |
| Caminhão | Retângulo largo, cinza (`#616161`) |
| Sedan | Retângulo, azul (`#1E88E5`) |
| Esportivo | Retângulo estreito, vermelho escuro (`#B71C1C`) |
| Moto | Retângulo fino, amarelo (`#FFC107`) |
| Fuel item | Círculo verde (`#43A047`) com glow sutil |
| Nitro item | Triângulo amarelo (`#FFD600`) com pulse |
| Bordas da pista | Linhas brancas sólidas com rumble strips vermelhas |

### 9.2 Efeitos Visuais (VFX)

| Efeito | Trigger | Implementação |
|--------|---------|---------------|
| Screen shake | Colisão | Offset random 2–6px por 0.3s |
| Faíscas | Raspão | 4–8 partículas amarelas, life 0.2s |
| Speed lines | Velocidade > 500 | Linhas brancas verticais nos lados |
| Flash vermelho | Colisão forte | Overlay vermelho 20% opacity, 0.15s |
| Explosão | Game over fatal | Círculos concêntricos expanding, 0.5s |
| Trail de combustível | Fuel baixo (< 20%) | Barra de fuel pisca + borda vermelha |
| Nitro trail | Durante boost | Partículas azuis atrás do carro |

---

## 10. Design de Áudio

### 10.1 SFX

| Som | Trigger | Estilo |
|-----|---------|--------|
| Engine hum | Constante durante gameplay | Synth low, pitch sobe com velocidade |
| Colisão leve | Raspão | Click metálico curto |
| Colisão forte | Frontal | Crunch + bass hit |
| Fuel pickup | Coletar fuel | Blip ascendente (alegre) |
| Nitro pickup | Coletar nitro | Whoosh + power chord |
| Nitro ativo | Durante boost | Jet engine filtered |
| Near miss | Passagem rente | Swoosh rápido + ding agudo |
| Combo up | Near miss combo | Ding com pitch crescente |
| Fuel low | < 20% fuel | Beep periódico (urgência) |
| Game over | Morte | Explosão reverberada + silêncio |
| New high score | Ao bater recorde | Fanfarra curta + shimmer |

### 10.2 Música

Trilha synthwave/chiptune minimalista. BPM sobe proporcionalmente à velocidade do jogo (100 BPM → 140 BPM). A trilha é procedural ou reativa, não um track fixo.

Alternativa: sem música, apenas sound design ambiente (engine + wind + tráfego). Testar ambas abordagens em playtesting.

---

## 11. Leaderboard Online & API

O ranking global é parte central da experiência. Ele transforma cada run individual em uma competição assíncrona contra todos os outros jogadores.

### 11.1 Endpoint

| | Detalhe |
|-|---------|
| URL | `https://n8n.ai-solutions.startse.com/webhook/e6c46e71-f564-4e8b-b6bd-041ca8f012e0` |
| Método | `POST` |
| Content-Type | `application/json` |
| Autenticação | Nenhuma (público — rate limit por IP recomendado no backend) |

### 11.2 Payload de Envio (POST)

O cliente envia os dados da run ao final de cada partida (no momento do game over). O payload segue o formato abaixo:

```json
{
  "player_name": "RenatoRush",
  "score": 12450,
  "distance_px": 84200,
  "survival_time_ms": 78340,
  "max_combo": 7,
  "near_misses": 23,
  "collisions": 4,
  "max_speed": 642,
  "fuel_collected": 5,
  "cause_of_death": "collision_fatal",
  "game_version": "1.0.0",
  "timestamp": "2026-03-13T14:32:00.000Z",
  "checksum": "a3f8...b2c1"
}
```

### 11.3 Especificação dos Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `player_name` | string (3–16 chars) | Sim | Nome exibido no ranking. Alfanumérico + underscore. Sanitizar no backend. |
| `score` | integer (>= 0) | Sim | Pontuação total da run (distância + near miss + coins + bônus). |
| `distance_px` | integer (>= 0) | Sim | Distância total percorrida em pixels lógicos. |
| `survival_time_ms` | integer (>= 0) | Sim | Tempo de sobrevivência em milissegundos (do início ao game over). |
| `max_combo` | integer (>= 0) | Sim | Maior combo de near miss atingido na run. |
| `near_misses` | integer (>= 0) | Sim | Total de near misses na run. |
| `collisions` | integer (>= 0) | Sim | Total de colisões sofridas (leves + fortes). |
| `max_speed` | integer (>= 0) | Sim | Velocidade máxima de scroll atingida (px/s). |
| `fuel_collected` | integer (>= 0) | Sim | Quantidade de itens de fuel coletados. |
| `cause_of_death` | enum string | Sim | Causa do game over: `fuel_empty` \| `collision_fatal` \| `collision_border` |
| `game_version` | string (semver) | Sim | Versão do cliente. Permite filtrar scores por versão no backend. |
| `timestamp` | string (ISO 8601) | Sim | Momento do game over. Gerado pelo cliente, validável no backend. |
| `checksum` | string (hex) | Sim | HMAC-SHA256 dos campos score+distance+time+version com secret compartilhado. Anti-tamper básico. |

### 11.4 Resposta Esperada do Backend

**Sucesso (HTTP 200):**

```json
{
  "status": "ok",
  "rank": 42,
  "total_players": 1337,
  "personal_best": 15200,
  "is_new_best": false
}
```

**Erro de validação (HTTP 422):**

```json
{
  "status": "error",
  "message": "checksum_invalid"
}
```

### 11.5 Fluxo de Integração

| Etapa | Momento | Ação |
|-------|---------|------|
| 1. Nome do jogador | Title screen (primeira vez) | Input de 3–16 caracteres, salvo em localStorage |
| 2. Gameplay | Durante a run | Acumular métricas em memória |
| 3. Game Over | Ao morrer | Calcular checksum, enviar POST ao webhook |
| 4. Resposta | ~200–500ms após POST | Exibir rank na tela de game over |
| 5. Leaderboard | Title screen ou game over | GET ao mesmo endpoint (sem body) retorna Top 20 |
| 6. Retry | Após ver rank | Tap para jogar de novo (não espera resposta da API) |

### 11.6 Considerações Anti-Cheat

- **Checksum HMAC-SHA256:** previne tamper básico no payload. O secret é ofuscado no bundle (não é segurança forte, mas eleva a barreira).
- **Validação server-side:** `survival_time_ms` e `distance_px` devem ser coerentes com `score` (ratio plausível). Backend rejeita outliers impossíveis.
- **Rate limit:** máximo 1 submit por 10 segundos por IP. Previne spam.
- **Score cap:** scores acima de um threshold (ex: 50.000) são flagged para review manual.
- **Game version:** permite invalidar scores de versões antigas se houver exploit conhecido.

> 🔒 **PRAGMATIC ANTI-CHEAT:** Em um jogo web client-side, anti-cheat perfeito é impossível. O objetivo não é impedir 100% das trapaças, mas tornar mais fácil jogar legitimamente do que hackear. O checksum + validação de coerência pega 95% dos casos. Para o 5% restante: leaderboard resets periódicos e moderação manual.

### 11.7 Implementação no Cliente (Pseudocódigo)

```javascript
async function submitScore(runData) {
  const payload = buildPayload(runData);
  payload.checksum = hmacSHA256(
    `${payload.score}:${payload.distance_px}:${payload.survival_time_ms}:${payload.game_version}`,
    SHARED_SECRET
  );
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    showRank(data.rank, data.total_players);
  } catch (e) {
    // Falha silenciosa — não bloqueia o retry
    showRank(null);
  }
}
```

> 🔥 **ASYNC-FIRST:** A submissão é fire-and-forget: o jogador pode apertar retry antes da resposta chegar. A UI do rank atualiza assincronamente. Nunca bloquear o retry loop — a prioridade #1 é manter o jogador jogando.

---

## 12. Arquitetura Técnica

### 12.1 Stack Recomendado

| Camada | Tecnologia | Justificativa |
|--------|------------|---------------|
| Renderer | HTML5 Canvas 2D | Suficiente para flat 2D, ótima performance mobile |
| Game Loop | requestAnimationFrame + delta time fixo | Consistência de física entre devices |
| Física | Custom (AABB collisions) | Simples o suficiente, sem lib externa |
| State | Finite State Machine | Title → Playing → GameOver → Playing |
| Audio | Web Audio API (ou Tone.js) | Síntese procedural para SFX |
| Leaderboard | fetch() → n8n webhook | POST no game over, GET para ranking |
| Build | Vite + vanilla JS/TS | Zero overhead, hot reload |
| Deploy | Static (Vercel/Cloudflare) | PWA com service worker |

### 12.2 Performance Targets

| Métrica | Target |
|---------|--------|
| FPS | 60 estável (30 mínimo aceitável em low-end) |
| Input latency | < 16ms (1 frame) |
| Bundle size | < 200KB gzipped (sem assets de áudio) |
| Time to interactive | < 2 segundos |
| Memory | < 50MB runtime |
| Leaderboard POST latency | < 500ms (não bloqueia UI) |

### 12.3 Game Loop (Pseudocódigo)

```
update(dt):
  scroll_pista(dt)
  mover_jogador(input, dt)
  spawnar_trafego(dt)
  mover_trafego(dt)
  checar_colisoes()
  atualizar_fuel(dt)
  atualizar_score(dt)
  atualizar_dda(dt)
  checar_game_over()

render():
  desenhar_pista()
  desenhar_itens()
  desenhar_trafego()
  desenhar_jogador()
  desenhar_vfx()
  desenhar_hud()
  desenhar_rank_hint()

onGameOver():
  calcular_metricas()
  submit_score_async()
  mostrar_game_over_ui()
```

---

## 13. Game Feel & Juice

Game feel é o que separa um protótipo funcional de um jogo que vicia. Cada interação deve ter consequência perceptível. Esta seção detalha os princípios de "juice" aplicados a Road Rush.

### 13.1 Princípios de Feedback

| Princípio | Aplicação em Road Rush |
|-----------|----------------------|
| Squash & Stretch | Carro do jogador comprime 5% horizontalmente ao mover rápido; estica 3% na vertical durante nitro |
| Anticipation | Barra de fuel pisca 2s ANTES de entrar na zona crítica (amarelo → vermelho) |
| Overshoot | Score counter ultrapassa o valor final e volta (ex: marca 12500, mostra 12520 por 1 frame, volta) |
| Follow-through | Ao coletar item, partículas continuam na direção do movimento do carro por 0.3s |
| Timing | Near miss feedback em < 50ms. Qualquer delay > 100ms quebra a sensação de causa-efeito |
| Exaggeration | Camera zoom sutil (2–3%) ao atingir velocidade máxima — amplifica a sensação de speed |

> 🎬 **JUICE IT OR LOSE IT:** Esses princípios vêm da animação Disney e foram adaptados para game design por Martin Jonasson e Petri Purho na famosa talk "Juice It or Lose It" (2012). A ideia central: adicionar feedback exagerado a cada ação transforma um jogo "ok" em um jogo "amazing" sem mudar nenhuma mecânica.

### 13.2 Hitstop (Freeze Frame)

Ao colidir (forte), o jogo pausa por 2–3 frames (33–50ms). Esse micro-congelamento amplifica o impacto da colisão e dá ao jogador um instante para processar o que aconteceu. É usado extensivamente em jogos de luta e ação (Street Fighter, Hades).

### 13.3 Screen Shake Budget

Screen shake é usado com parcimônia para não dessensibilizar. O "budget" define intensidade máxima por tipo de evento:

| Evento | Intensidade | Duração | Frequência Máxima |
|--------|------------|---------|-------------------|
| Raspão | 2px | 0.15s | Sem limite |
| Colisão forte | 6px | 0.3s | 1 por segundo |
| Game over | 10px (decay) | 0.5s | 1 por sessão |
| Nitro ativado | 3px (1 pulse) | 0.1s | 1 por uso |

---

## 14. Métricas de Sucesso

| Métrica | Target | Como Medir |
|---------|--------|------------|
| Retry rate | > 80% jogam 3+ runs | Analytics: runs por sessão |
| Sessão média | 45–120 segundos por run | `survival_time_ms` do leaderboard POST |
| D1 retention | > 30% | Retorno em 24h (cookie/localStorage) |
| Near miss ratio | > 40% dos pontos vêm de near miss | `near_misses` × combo / score total |
| Time to first retry | < 500ms | Delta entre game over e próximo input |
| Leaderboard engagement | > 60% olham o ranking | Cliques na aba de leaderboard |
| Score distribution | Curva normal com cauda longa | Distribuição saudável = dificuldade calibrada |

---

## 15. Roadmap de Desenvolvimento

| Fase | Entregável | Duração |
|------|-----------|---------|
| MVP | Pista + carro + tráfego + colisão + fuel + score + game over + retry | 1 semana |
| Difficulty | 4 atos + multi-axis scaling + DDA + spawn patterns + death spiral mitigation | 1 semana |
| Juice | VFX + SFX + near miss + combo + hitstop + screen shake + squash/stretch | 1 semana |
| Leaderboard | POST ao webhook + ranking na UI + GET top 20 + anti-cheat básico | 3–4 dias |
| Polish | PWA + responsive + performance tuning + playtesting + balanceamento final | 1 semana |
| Post-launch | Daily challenges + skins + leaderboard semanal + analytics dashboard | Contínuo |

---

*Road Rush — Where every second counts.*