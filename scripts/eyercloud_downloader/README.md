# EyerCloud Image Downloader

Este script automatiza o download de todas as imagens de exames do EyerCloud. Ele mantém um registro local para baixar apenas novos exames em execuções futuras.

## Pré-requisitos

1. Python 3 instalado.
2. Biblioteca `requests` instalada:
   ```bash
   pip install requests
   ```

## Como usar

### 1. Obter os Cookies de Autenticação
O script precisa dos seus cookies de sessão para funcionar, pois o EyerCloud não utiliza um token de API simples.

1. Abra o navegador no EyerCloud e faça login.
2. Pressione `F12` para abrir as Ferramentas do Desenvolvedor.
3. Vá na aba **Rede (Network)**.
4. Recarregue a página ou clique em algum exame.
5. Procure por uma requisição para `eyercloud.com` (ex: `list`).
6. No painel da direita, em **Headers**, procure por **Request Headers**.
7. Copie todo o valor que está na frente de **Cookie**.

### 2. Configurar o Script
1. Abra o arquivo `downloader.py`.
2. Cole os cookies copiados na variável `COOKIES`. Você pode colar a string inteira:
   ```python
   COOKIES = "Sua_String_De_Cookie_Aqui"
   ```

### 3. Executar
Abra o terminal na pasta do script e execute:
```bash
python downloader.py
```

## Estrutura de Pastas
- As imagens serão salvas na pasta `downloads/`.
- Cada pasta seguirá o padrão `Nome_Paciente_IDExame`.
- O arquivo `download_state.json` impede o download duplicado de exames já processados.
