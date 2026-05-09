.PHONY: build watch clean

build:
	npx sass style.scss style.css

watch:
	npx sass --watch style.scss style.css

clean:
	rm -f style.css style.css.map