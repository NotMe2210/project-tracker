# Projekttracker mit Server-Speicherung (PHP + Apache, SQLite oder MySQL/MariaDB)
FROM php:8.3-apache

RUN docker-php-ext-install pdo_mysql \
 && a2enmod headers \
 && sed -ri 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf

COPY index.html app.js i18n.js lang-en.js styles.css version.json manifest.webmanifest icon-180.png icon-512.png api.php .htaccess /var/www/html/
COPY data/.htaccess data/index.html /var/www/html/data/

RUN chown -R www-data:www-data /var/www/html/data

VOLUME /var/www/html/data
EXPOSE 80
