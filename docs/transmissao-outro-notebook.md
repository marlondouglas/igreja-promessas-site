# Transmitir de outro notebook pela internet

O estúdio pode abrir em `https://igrejapromessas.site/culto/studio.html` e usar a
câmera, o microfone ou a tela do notebook em que essa página estiver aberta. Para
enviar o vídeo pela internet, ele precisa alcançar uma **entrada WHIP em HTTPS**
do servidor da igreja, com autenticação e conectividade WebRTC.

`127.0.0.1` e `localhost` apontam sempre para o computador de quem abriu a página.
Por isso, `http://127.0.0.1:8889/culto/whip` serve apenas para publicar no servidor
que está no próprio notebook. Esse endereço não alcança o MARLON-TIFFANY quando
usado em outro computador.

## O que esta alteração prepara

- Escolha entre publicar no próprio notebook servidor e publicar de outro
  notebook pela internet.
- Campo para a URL WHIP remota em HTTPS. A senha é informada separadamente no
  estúdio; não deve fazer parte da URL.
- Leitura das opções ICE de STUN/TURN anunciadas pelo servidor no cabeçalho
  `Link` de uma resposta `OPTIONS`.
- Validação da URL da sessão WHIP antes de usá-la para encerrar o envio, exigindo
  a mesma origem da entrada configurada.

O arquivo público `culto/publisher-config.json` permite definir o endereço de
entrada padrão para os operadores:

```json
{
  "remoteWhipUrl": ""
}
```

Deixe-o vazio enquanto não houver uma entrada remota configurada e testada.
Depois da verificação, preencha somente com a URL HTTPS do servidor. Esse arquivo
é público: **não coloque nele senha de publicação, token ou segredo de TURN**.
A URL também pode ser informada manualmente no estúdio. A senha de publicação
fica apenas na memória da página e deve ser digitada novamente após recarregá-la.
Não envie a senha nesta conversa nem a acrescente aos arquivos do GitHub.

O endereço HTTPS de HLS existente em `stream-config.json` é a **saída para quem
assiste**. Ele não comprova que exista uma entrada WHIP remota no mesmo endereço.
Não substitua a saída HLS por uma URL WHIP.

## O que ainda precisa ser feito no servidor

O repositório contém o site estático, não a instalação ativa do MediaMTX. A
configuração atual de rede e do servidor não foi inspecionada nesta alteração:
o acesso remoto ao MARLON-TIFFANY estava sem cota disponível no Desktop Commander.
Por isso, a alteração da página **não certifica que uma publicação pela internet
já funciona**.

Antes de qualquer mudança no notebook, apresentar o plano e aguardar a
autorização do responsável. Fazer a configuração fora de uma transmissão ativa,
com cópia da configuração anterior e um caminho de retorno. Não substituir
arquivos do MediaMTX, reiniciar serviços, alterar túnel ou abrir portas como parte
de uma tentativa sem esse diagnóstico.

O diagnóstico e a configuração precisam confirmar:

1. A versão instalada do MediaMTX, o caminho de publicação, a autenticação e as
   interfaces/portas em que cada serviço escuta. Nunca remover a senha para
   facilitar o acesso externo.
2. Uma rota HTTPS de entrada WHIP até o serviço correto, com certificado válido
   para navegadores externos. Confirmar métodos `OPTIONS`, `POST` e `DELETE` e
   o encaminhamento correto dos endereços de sessão em `Location`.
3. CORS para a origem do estúdio (`https://igrejapromessas.site`): permitir os
   métodos necessários e os cabeçalhos de requisição `Authorization` e
   `Content-Type`, e expor os cabeçalhos de resposta `Location` e `Link`. Uma
   resposta genérica de página HTML ou um HTTP 404 não comprovam uma entrada WHIP.
4. Candidatos ICE que o outro notebook realmente consiga alcançar. Dependendo da
   rede, isso envolve endereço externo correto, portas UDP/TCP e regras de
   firewall/NAT. Um proxy HTTPS transporta a negociação WHIP; **ele não transporta
   sozinho os pacotes de áudio e vídeo do WebRTC**.
5. Um relay TURN para atender redes que bloqueiam conexões diretas ou ficam atrás
   de NAT restritivo. Preferir credenciais temporárias fornecidas pelo backend,
   compatíveis com o anúncio de ICE do WHIP. STUN sozinho não garante acesso de
   qualquer rede. Conferir também o custo de tráfego do relay escolhido.
6. A política para publicadores concorrentes. Quando suportado pela versão
   instalada, avaliar `overridePublisher: false` para impedir que uma nova sessão
   substitua a transmissão atual. Conferir esse comportamento em teste, sem
   experimentar no canal que estiver ao vivo.
7. A continuidade da saída usada pelo público, incluindo HLS, conversão de áudio
   AAC e o acesso no iPhone. A entrada remota não deve alterar esses caminhos sem
   uma necessidade verificada.

O MARLON-TIFFANY continua sendo o servidor de distribuição nessa arquitetura. Ele
precisa permanecer ligado, acordado e conectado à internet, mesmo quando a câmera
e a produção estiverem em outro notebook. Para transmitir com esse notebook
desligado, será necessária uma migração separada do servidor para outra máquina
ou hospedagem, a ser planejada e autorizada.

## Como o operador usará o estúdio

Depois de a entrada remota estar configurada e testada:

1. Confirmar que não há outra transmissão usando o canal e que o servidor da
   igreja está disponível.
2. Abrir o estúdio pelo endereço HTTPS público em um navegador atualizado no
   outro notebook. Não usar o endereço `127.0.0.1` do notebook anterior.
3. Escolher **Outro notebook pela internet**, conferir a URL WHIP HTTPS fornecida
   pelo responsável e digitar a senha no campo privado.
4. Preparar a câmera/microfone ou escolher a aba, janela ou tela. Autorizar os
   dispositivos no navegador e conferir imagem e som. Para áudio da aba, usar a
   opção correspondente no seletor de compartilhamento quando disponível.
5. Usar **Verificar servidor**. Essa verificação não envia vídeo; uma resposta do
   endpoint também não confirma que a senha será aceita, que a mídia conseguirá
   passar pela rede ou que o público está recebendo o culto.
6. Quando autorizado a iniciar o envio, marcar a opção de publicação e iniciar
   a apresentação. **Modo de teste acelera a apresentação; ele não torna uma
   publicação privada.** Se o envio estiver habilitado, o vídeo pode ir ao canal
   mesmo em um ensaio.
7. Acompanhar o estado da conexão. Uma conexão WebRTC estabelecida confirma o
   enlace do estúdio com o servidor, não a reprodução pública de ponta a ponta.
   Abrir a página do público em um celular com internet móvel e conferir imagem
   e áudio antes de considerar a transmissão verificada.
8. Manter o notebook de produção carregado, acordado e com a página aberta. Ao
   terminar, encerrar o envio e conferir o encerramento também na página pública.

## Testes e publicação

Preparar um canal de teste separado no servidor antes do ensaio externo. O canal
de produção `culto` não deve ser usado para testar concorrência, substituir um
publicador ou experimentar novas regras de rede enquanto houver uma live ativa.
O cliente e a configuração do canal de teste devem ser preparados explicitamente
para esse ensaio, preservando a configuração de produção.

O teste final precisa ocorrer em outro notebook e, de preferência, em outra rede:
validar autenticação, áudio/vídeo, reconexão, encerramento da sessão, comportamento
quando já existe um publicador e reprodução HLS em celular. Também é necessário
testar o caso em que a conexão depende de TURN. Nenhum desses testes reais foi
concluído apenas com a preparação do frontend.

Um `push` na branch `main` aciona automaticamente a publicação do site pelo
workflow `.github/workflows/publicar-site.yml`. Manter a alteração em uma branch
ou PR para revisão; explicar o resultado preparado e aguardar autorização antes
de publicar em `main`. A publicação do site e as alterações no servidor são
etapas distintas e precisam de verificação própria.
