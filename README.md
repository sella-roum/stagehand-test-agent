# Stagehand Test Pilot 🚀

**Stagehand Test Pilot**は、AIを活用した次世代のテスト実行自動化エージェントです。
自然言語で書かれた曖昧なテストシナリオを、AIが構造化されたテストケースに変換し、ブラウザ上で自律的に実行・検証します。

このプロジェクトは、[Stagehand](https://github.com/browserbase/stagehand)フレームワークを基盤とし、開発者と非エンジニア（QA、PMなど）の協力を促進することで、テスト自動化の新しいパラダイムを提案します。

## ✨ 主な機能

- **自然言語からのテスト生成**: 「ログインして商品を検索する」といった日常的な言葉で書かれたシナリオを、AIがテスト業界標準の**Gherkin形式 (`Given-When-Then`)** に自動変換します。
- **自律的なテスト実行**: 変換されたシナリオに基づき、AIエージェントがブラウザを操作し、テストを最後まで実行します。
- **インテリジェントな自己修復**: テスト中に要素が見つからないなどのエラーが発生した場合、AIが状況を分析し、代替案を試みてテストの続行を試みます。
- **対話型テスト構築**: `interactive`モードを使えば、AIとチャットしながらステップごとにテストを作成・デバッグできます。
- **マルチLLM対応**: `.env`ファイルを変更するだけで、Google Gemini, Groq, OpenAI, Cerebrasなど、様々な大規模言語モデルを柔軟に切り替え可能です。
- **詳細なテストレポート**: テスト完了後、各ステップの結果と失敗時のスクリーンショットを含むMarkdown形式のレポートを自動生成します。

## 🛠️ セットアップ

### 1. 前提条件

- [Node.js](https://nodejs.org/) (v20以降)
- npm (Node.jsに同梱)

### 2. インストール

```bash
# 1. リポジトリをクローン
git clone <your-repo-url>
cd stagehand-test-pilot

# 2. 依存関係をインストール
npm install
```

### 3. 環境変数の設定

プロジェクトのルートにある`.env.example`をコピーして`.env`ファイルを作成します。

```bash
cp .env.example .env
```

次に、`.env`ファイルを開き、使用したいAIプロバイダのAPIキーを設定してください。`LLM_PROVIDER`で使用するプロバイダを指定するのを忘れないでください。

```.env
# .env

# 'google', 'groq', 'openai', 'cerebras' のいずれかを指定
LLM_PROVIDER="google"

# 使用するプロバイダのAPIキーとモデル名を設定
GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"
GOOGLE_DEFAULT_MODEL="gemini-1.5-pro-latest"
GOOGLE_FAST_MODEL="gemini-1.5-flash-latest"

# ... 他のプロバイダ設定 ...
```

## 🚀 実行方法

### 自律モード (CI/CD向け)

テキストファイルに書かれたシナリオを読み込み、最後まで自動で実行します。

1.  `tests/scenarios/`ディレクトリ内に、テストしたい内容を自然言語で記述したテキストファイルを作成します。（例: `my-test.txt`）

2.  以下のコマンドを実行します。

```bash
npm start tests/scenarios/my-test.txt
```

テストが完了すると、`test-results/`ディレクトリにレポートが生成されます。

### 対話モード (テスト作成・デバッグ向け)

AIと対話しながら、ステップごとにテストを構築・実行します。

```bash
npm start -- --interactive
```

プロンプトが表示されたら、実行したいシナリオを自然言語で入力してください。AIがGherkin形式に変換した計画を提示し、あなたの承認を得ながらテストを進めます。

## 🧪 テスト

プロジェクト自体の品質を保証するために、Playwrightを使用したE2Eテストが含まれています。

````bash
npm test
```

## 🤝 貢献

このプロジェクトは発展途上です。Issueの報告やプルリクエストを歓迎します。
開発を始める前に、コードスタイルを統一するため以下のコマンドを実行してください。

```bash
# コードフォーマットの自動修正
npm run format

# リンティングエラーのチェック
npm run lint
````
