/* Source-backed background notes shown in each work's start modal. */

const HAYES_BOOK = {
  text: 'Hayes, Strosahl & Wilson『Acceptance and Commitment Therapy』第2版（2011）',
  href: 'https://www.guilford.com/books/Acceptance-and-Commitment-Therapy/Hayes-Strosahl-Wilson/9781609189624',
};

const ACBS_ABOUT_ACT = {
  text: 'Association for Contextual Behavioral Science「About ACT」',
  href: 'https://contextualscience.org/about_act',
};

export const WORK_BACKGROUNDS = Object.freeze({
  1: Object.freeze({
    summary: '場面・反応・その後を並べ、同じ行動でも働きが変わることを振り返るためのワークです。',
    sources: Object.freeze([
      Object.freeze({
        relation: '一般理論のみ',
        citation: 'Hanley, G. P., Iwata, B. A., & McCord, B. E. (2003). “Functional analysis of problem behavior: a review.”',
        note: '行動と環境の関係を見る考え方を参考にしています。このワークは自己記入による振り返りで、論文が定義する正式な評価手続ではありません。',
        links: Object.freeze([
          Object.freeze({ text: 'Hanley, Iwata & McCord「Functional analysis of problem behavior: a review」（2003）', href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC1284431/' }),
        ]),
      }),
    ]),
  }),
  2: Object.freeze({
    summary: 'しんどさをしのぐための工夫を、良し悪しで決めず、場面ごとの助けと負担の両方から見直すワークです。',
    sources: Object.freeze([
      Object.freeze({
        relation: '出典未確定',
        citation: 'D.O.T.S.という略語の最初の出典・正式な課題名・ページは未確認です。',
        note: 'D/O/T/Sを標準化されたACT課題や、原典どおりの略語としては表示していません。',
        links: Object.freeze([]),
      }),
      Object.freeze({
        relation: '一般理論のみ',
        citation: 'Hayes, S. C., Strosahl, K. D., & Wilson, K. G. (2011). “Acceptance and Commitment Therapy: The Process and Practice of Mindful Change” (2nd ed.).',
        note: 'しんどさへの対処を、受け入れや大切にしたい方向との関係から見る一般的な考え方を参考にしています。',
        links: Object.freeze([HAYES_BOOK, ACBS_ABOUT_ACT]),
      }),
    ]),
  }),
  3: Object.freeze({
    summary: '考えや気持ちを消そうとしたときに何が起きるかを、今回の体験として観察するワークです。結果は人や状況で異なります。',
    sources: Object.freeze([
      Object.freeze({
        relation: '直接の実験課題を翻案',
        citation: 'Wegner, D. M., Schneider, D. J., Carter, S. R., & White, T. L. (1987). “Paradoxical effects of thought suppression.”',
        note: '「白くまを考えない」課題は、この研究の実験課題に直接対応します。ただし、画面内のほかの演習や個人の結果まで研究と同一とは扱いません。',
        links: Object.freeze([
          Object.freeze({ text: 'Wegner et al.「Paradoxical effects of thought suppression」（1987）', href: 'https://pubmed.ncbi.nlm.nih.gov/3612492/' }),
        ]),
      }),
      Object.freeze({
        relation: '構造を参考',
        citation: 'Hayes, Strosahl, & Wilson (2011). “Acceptance and Commitment Therapy” (2nd ed.).',
        note: '白くま以外は、考えや気持ちを消すことにこだわらず、起きたことを観察するACTの一般的な構造を参考にしています。',
        links: Object.freeze([HAYES_BOOK]),
      }),
    ]),
  }),
  4: Object.freeze({
    summary: '浮かぶ言葉や気持ちを消さず、周りの感覚や選べそうな行動と一緒に眺めるためのワークです。',
    sources: Object.freeze([
      Object.freeze({
        relation: '一般理論のみ',
        citation: 'Hayes, S. C., Strosahl, K. D., & Wilson, K. G. (2011). “Acceptance and Commitment Therapy” (2nd ed.).',
        note: '考えとの距離、今ここで気づくこと、大切にしたい方向と行動を扱う一般理論を参考にしています。「通知」や「モニター」の画面は、確認した原典の標準課題ではありません。',
        links: Object.freeze([HAYES_BOOK, ACBS_ABOUT_ACT]),
      }),
    ]),
  }),
  5: Object.freeze({
    summary: '生活で大切にしたい方向と、今の条件で試せそうな小さな行動を結び付けるワークです。',
    sources: Object.freeze([
      Object.freeze({
        relation: '構造を参考',
        citation: 'Hayes, S. C., Strosahl, K. D., & Wilson, K. G. (2011). “Acceptance and Commitment Therapy” (2nd ed.).',
        note: '大切にしたい方向と、そこへ向かう行動を結び付ける構造を参考にしています。領域の一覧、質問文、「心のコンパス」の原典ページは未確認です。',
        links: Object.freeze([HAYES_BOOK, ACBS_ABOUT_ACT]),
      }),
    ]),
  }),
  6: Object.freeze({
    summary: '浮かぶ言葉を葉に置き、消すことを目標にせず、動き方を少し眺めるためのワークです。',
    sources: Object.freeze([
      Object.freeze({
        relation: '構造を参考',
        citation: 'Harris, R. (2019). “ACT Made Simple: An Easy-to-Read Primer on Acceptance and Commitment Therapy” (2nd ed.).',
        note: '“Leaves on a Stream”という名称と、言葉を葉に置いて流れを眺める構造が近い資料です。最初の提案者、採用した版、章・ページ、逐語台本は未確認です。',
        links: Object.freeze([
          Object.freeze({ text: 'Russ Harris『ACT Made Simple』第2版（2019）', href: 'https://www.newharbinger.com/9781684033010/act-made-simple/' }),
          ACBS_ABOUT_ACT,
        ]),
      }),
    ]),
  }),
  7: Object.freeze({
    summary: '頭に浮かぶ言葉を、正しいかどうかを急いで決めず、少し距離を取って眺めるためのワークです。',
    sources: Object.freeze([
      Object.freeze({
        relation: '構造を参考',
        citation: 'Hayes, S. C., Strosahl, K. D., & Wilson, K. G. (2011). “Acceptance and Commitment Therapy” (2nd ed.).',
        note: '考えを論破せず、考えとの関係を変えながら、小さな行動を選ぶ構造を参考にしています。「通知に名を付ける」台本の出典は確認できていません。',
        links: Object.freeze([HAYES_BOOK, ACBS_ABOUT_ACT]),
      }),
    ]),
  }),
  8: Object.freeze({
    summary: '動かしにくいこと、働きかけられること、今の条件で選べそうなことを分け、力を向ける先を探すワークです。',
    sources: Object.freeze([
      Object.freeze({
        relation: '構造を参考',
        citation: 'Association for Contextual Behavioral Science. “The ACT Matrix.” 開発: Kevin Polk, Mark Webster, Jerold Hambright. 公開年の記載なし。',
        note: 'ACT Matrixの見分け方を参考にしています。ただし、このワークの3領域は、ACT Matrixの4象限とは異なる再構成です。3領域版の原典・課題名・ページは未確認です。',
        links: Object.freeze([
          Object.freeze({ text: 'Association for Contextual Behavioral Science「The ACT Matrix」', href: 'https://contextualscience.org/the_act_matrix' }),
          HAYES_BOOK,
        ]),
      }),
    ]),
  }),
});
