/*
 *  Include server framework package
 */ 
const express = require('express');

/*
 * Body parser package
 */
const bodyParser = require('body-parser');

/*
 *  HTML to PDF package
 */
const htmlPdf = require('html-pdf-chrome');

/*
 * Template pre-processor package
 */
const ejs = require('ejs');

/*
 * Route validator package
 */
const joi = require('joi');

/*
 * Date utility package
 */
const dateFns = require('date-fns');

/*
 * Invoice Not Found error
 */
const InvoiceNotFound = new Error('Invoice template not found');

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *  */
/*
 * Utility functions
 */

const fileExists = (filepath) => {
    try {
        return require(filepath)
    } catch (error) {
        console.log(error);

        return false;
    }
};

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *  */

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *  */
/*
 * Service functions
 */

const { merge } = require('lodash')

 /*
  * Get default config
  */
const getDefaultInvoiceConfig = ({ buyerId, sellerId }) => {
    const invoicesDir = './config/invoices/';
    const tag = `${sellerId}@${buyerId}`;

    const path = invoicesDir + tag;

    if (!fileExists(path)) {
        throw InvoiceNotFound;
    }

    return require(path);
};

const getInvoiceConfig = (requestPayload) => {
    const defaultConfig = getDefaultInvoiceConfig(requestPayload);

    const getCnfigFromPayload = () => {
        const now = new Date()
        const parsedDate = dateFns.parse(requestPayload.date)
        const prevMonth = dateFns.addMonths(parsedDate, -1);

        const dateOfExposure = dateFns.format(now, 'DD-MM-YYYY');
        const documentDate = `01/${dateFns.format(parsedDate, 'MM')}/${dateFns.format(parsedDate, 'YYYY')}`
        const dateOfSell = dateFns.format(dateFns.lastDayOfMonth(prevMonth), 'DD-MM-YYYY')

        const product = {
            information: `${requestPayload.hours}h`,
            price: requestPayload.price.toFixed(2),
        };

        const payment = {
            toPayInNumbers: Intl.NumberFormat(defaultConfig.country,
                { style: 'currency', currency: defaultConfig.currency }
            ).format(+product.price)
        };

        return {
            dateOfExposure,
            dateOfSell,
            documentDate,

            product,
            payment,
        }
    };

    const customConfig = getCnfigFromPayload()

    return merge(
        merge(
            defaultConfig,
            customConfig,
        ), 
        requestPayload
    );
};

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *  */

/*
 *  Include configuration object
 */
const config = {
    port: 8080,
    defaultInvoiceTemplatePath: './templates/invoice.ejs',
};

/* 
 * Validator object for HTTP 1.1 POST / request
 */
const schema = joi.object().keys({
    buyerId: joi.string().required(),
    sellerId: joi.string().required(),

    date: joi.date().iso().required(),
    hours: joi.number().required(),
    price: joi.number().required(),

    invoice: joi.object().optional(),
});

/*
 * Validator middleware
 */
const validator = (schema) => {
    return async (req, res, next) => {
        try {
            await joi.validate(req.body, schema);
            next();
        } catch (error) {
            console.log(error);
            next(error);
        }
    }
};

/*
 * Express's App instance
 */
const app = express();

/*
 * Attach body parser to app middleware
 */
app.use(bodyParser());

app.post('/', validator(schema), async (req, res, next) => {
    try {
        const { body } = req;

        const userInvoiceConfig = getInvoiceConfig(body);

        const compiledHtml = await ejs.renderFile(config.defaultInvoiceTemplatePath, { ...userInvoiceConfig })

        const pdf = await htmlPdf.create(compiledHtml, {
            printOptions: {
                printBackground: true,
            },
        });

        const stream = pdf.toStream();

        const filename = 'invoice.pdf';
        res.setHeader('Content-disposition', `inline: filename="${filename}"`);
        res.setHeader('Content-type', 'application/pdf');
        stream.pipe(res)
    } catch (error) {
        console.log('Error:', error);
        res.send(error).status(500);
    }
});

/*
 * Define and attach error middleware
 */
app.use((_error, req, res, next) => {
    const statusCode = _error.isJoi 
        ? 400
        : _error.statusCode || _error.status || _error.code || 500;

    const error = _error.name;
    const message = _error.message;

    res.status(statusCode).json({
        statusCode,
        error,
        message,
    });
});

app.listen(config.port, () => {
    console.log('App is listening on port', config.port)
});
