FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
COPY investors.html /usr/share/nginx/html/investors.html
COPY developers.html /usr/share/nginx/html/developers.html
COPY traders.html /usr/share/nginx/html/traders.html
COPY liquidity.html /usr/share/nginx/html/liquidity.html
COPY ja/ /usr/share/nginx/html/ja/
COPY og.png /usr/share/nginx/html/og.png
EXPOSE 8080
RUN sed -i 's/listen\s*80;/listen 8080;/' /etc/nginx/conf.d/default.conf
