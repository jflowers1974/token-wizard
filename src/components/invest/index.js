import React from 'react'
import {
  getCurrentAccount,
  checkNetWorkByID,
  checkTxMined,
  sendTXToContract,
  calculateGasLimit,
  attachToInitCrowdsaleContract,
  methodToExec
} from '../../utils/blockchainHelpers'
import {
  getAccumulativeCrowdsaleData,
  getTokenData,
  getCrowdsaleData,
  getCrowdsaleTargetDates,
  getCurrentRate,
  initializeAccumulativeData,
  isFinalized,
  toBigNumber
} from '../crowdsale/utils'
import { countDecimalPlaces, getQueryVariable, toast } from '../../utils/utils'
import { getWhiteListWithCapCrowdsaleAssets } from '../../stores/utils'
import {
  invalidCrowdsaleAddrAlert,
  investmentDisabledAlertInTime, noGasPriceAvailable,
  noMetaMaskAlert,
  successfulInvestmentAlert
} from '../../utils/alerts'
import { Loader } from '../Common/Loader'
import { CrowdsaleConfig } from '../Common/config'
import { INVESTMENT_OPTIONS, TOAST } from '../../utils/constants'
import { inject, observer } from 'mobx-react'
import QRPaymentProcess from './QRPaymentProcess'
import CountdownTimer from './CountdownTimer'
import classNames from 'classnames'
import moment from 'moment'
import { toJS } from 'mobx'

@inject(
  'contractStore',
  'crowdsalePageStore',
  'web3Store',
  'tierStore',
  'tokenStore',
  'generalStore',
  'investStore',
  'gasPriceStore',
  'generalStore'
)
@observer
export class Invest extends React.Component {
  constructor(props) {
    super(props)
    window.scrollTo(0, 0)

    this.state = {
      loading: true,
      pristineTokenInput: true,
      web3Available: false,
      investThrough: INVESTMENT_OPTIONS.QR,
      crowdsaleExecID: CrowdsaleConfig.crowdsaleContractURL || getQueryVariable('exec-id'),
      toNextTick: {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0
      },
      nextTick: {},
      msToNextTick: 0,
      displaySeconds: false,
      isFinalized: false
    }
  }

  componentDidMount () {
    const { web3Store, gasPriceStore, generalStore } = this.props
    const { web3 } = web3Store

    if (!web3) {
      this.setState({ loading: false })
      return
    }

    const networkID = CrowdsaleConfig.networkID ? CrowdsaleConfig.networkID : getQueryVariable('networkID')
    checkNetWorkByID(networkID)

    this.setState({
      web3Available: true,
      investThrough: INVESTMENT_OPTIONS.METAMASK
    })

    getWhiteListWithCapCrowdsaleAssets(networkID)
      .then(_newState => {
        this.setState(_newState)
        this.extractContractsData()
        gasPriceStore.updateValues()
          .then(() => generalStore.setGasPrice(gasPriceStore.slow.price))
          .catch(() => noGasPriceAvailable())
      })
  }

  componentWillUnmount () {
    this.clearTimeInterval()
  }

  extractContractsData() {
    const { contractStore, web3Store } = this.props
    const { web3 } = web3Store

    const crowdsaleExecID = CrowdsaleConfig.crowdsaleContractURL ? CrowdsaleConfig.crowdsaleContractURL : getQueryVariable('exec-id')

    //to do
    /*if (!web3.utils.isAddress(crowdsaleAddr)) {
      this.setState({ loading: false })
      return invalidCrowdsaleAddrAlert()
    }*/

    getCurrentAccount()
      .then(account => {
        console.log("crowdsaleExecID:", crowdsaleExecID)
        contractStore.setContractProperty('crowdsale', 'execID', crowdsaleExecID)

        this.setState({
          curAddr: account,
          web3
        })

        if (!contractStore.crowdsale.execID) {
          this.setState({ loading: false })
          return
        }

        attachToInitCrowdsaleContract()
          .then((initCrowdsaleContract) => {
            initializeAccumulativeData()
            .then(() => {
              let whenTokenData = getTokenData(initCrowdsaleContract, crowdsaleExecID)
              let whenCrowdsaleData = getCrowdsaleData(initCrowdsaleContract, crowdsaleExecID)
              return Promise.all([whenTokenData, whenCrowdsaleData])
            })
              .then(() => getAccumulativeCrowdsaleData(initCrowdsaleContract, crowdsaleExecID))
              .then(() => getCrowdsaleTargetDates(initCrowdsaleContract, crowdsaleExecID))
              .then(() => this.checkIsFinalized(initCrowdsaleContract, crowdsaleExecID))
              .then(() => this.setTimers())
              .catch(err => {
                this.setState({ loading: false })
                console.log(err)
              })
              .then(() => this.setState({ loading: false }))
          })
          .catch(err => {
            this.setState({ loading: false })
            console.log(err)
          })
      })
      .catch(err => {
        this.setState({ loading: false })
        console.log(err)
      })
  }

  checkIsFinalized(initCrowdsaleContract, crowdsaleExecID) {
    return isFinalized(initCrowdsaleContract, crowdsaleExecID)
      .then(isFinalized => {
        this.setState({ isFinalized })
      })
  }

  setTimers = () => {
    const { crowdsalePageStore } = this.props
    let nextTick = 0
    let millisecondsToNextTick = 0
    let timeInterval

    if (crowdsalePageStore.ticks.length) {
      nextTick = crowdsalePageStore.extractNextTick()
      millisecondsToNextTick = nextTick.time - Date.now()
      const FIVE_MINUTES_BEFORE_TICK = moment(millisecondsToNextTick).subtract(5, 'minutes').valueOf()
      const ONE_DAY = 24 * 3600 * 1000

      if (FIVE_MINUTES_BEFORE_TICK < ONE_DAY) {
        setTimeout(() => {
          this.setState({ displaySeconds: true })
        }, FIVE_MINUTES_BEFORE_TICK)
      }

      timeInterval = setInterval(() => {
        const time = moment.duration(this.state.nextTick.time - Date.now())

        this.setState({
          toNextTick: {
            days: Math.floor(time.asDays()) || 0,
            hours: time.hours() || 0,
            minutes: time.minutes() || 0,
            seconds: time.seconds() || 0
          }
        })
      }, 1000)
    }


    this.setState({
      nextTick,
      msToNextTick: millisecondsToNextTick,
      displaySeconds: false,
      timeInterval
    })
  }

  resetTimers = () => {
    this.clearTimeInterval()
    this.setTimers()
  }

  clearTimeInterval = () => {
    if (this.state.timeInterval) clearInterval(this.state.timeInterval)
  }

  investToTokens = event => {
    const { investStore, crowdsalePageStore, web3Store } = this.props
    const { startDate } = crowdsalePageStore
    const { web3 } = web3Store

    event.preventDefault()

    if (!this.isValidToken(investStore.tokensToInvest)) {
      this.setState({ pristineTokenInput: false })
      return
    }

    this.setState({ loading: true })

    if (!startDate) {
      this.setState({ loading: false })
      return
    }

    if (web3.eth.accounts.length === 0) {
      this.setState({ loading: false })
      return noMetaMaskAlert()
    }

    this.investToTokensForWhitelistedCrowdsale()
  }

  investToTokensForWhitelistedCrowdsale() {
    const { crowdsalePageStore } = this.props

    if (crowdsalePageStore.startDate > (new Date()).getTime()) {
      this.setState({ loading: false })
      return investmentDisabledAlertInTime(crowdsalePageStore.startDate)
    }

    getCurrentAccount()
      .then(account => {
        attachToInitCrowdsaleContract()
          .then((initCrowdsaleContract) => {
            this.investToTokensForWhitelistedCrowdsaleInternal(initCrowdsaleContract, account)
          })
      })

    /*findCurrentContractRecursively(0, null, (crowdsaleContract, tierNum) => {
      if (!crowdsaleContract) {
        this.setState({ loading: false })
        return
      }

      getCurrentRate(crowdsaleContract)
        .then(() => web3.eth.getAccounts())
        .then((accounts) => this.investToTokensForWhitelistedCrowdsaleInternal(crowdsaleContract, tierNum, accounts))
        .catch(console.log)
    })*/
  }

  getBuyParams = (account, weiToSend) => {
    const { web3Store } = this.props
    const { web3 } = web3Store
    console.log(this.state.crowdsaleExecID)
    console.log(account)
    console.log(weiToSend)
    let paramsBuy = [this.state.crowdsaleExecID, account, weiToSend];
    console.log(paramsBuy);
    let encodedParameters = web3.eth.abi.encodeParameters(["bytes32","address","uint256"], paramsBuy);
    return encodedParameters;
  }

  investToTokensForWhitelistedCrowdsaleInternal = (initCrowdsaleContract, account) => {
    const { web3Store, contractStore, tokenStore, crowdsalePageStore, investStore, generalStore } = this.props
    const { web3 } = web3Store

    let nextTiers = [""]
    /*for (let i = tierNum + 1; i < contractStore.crowdsale.execID.length; i++) {
      nextTiers.push(contractStore.crowdsale.execID[i])
    }*/
    console.log('nextTiers:', nextTiers)
    console.log(nextTiers.length)

    const decimals = parseInt(tokenStore.decimals, 10)
    console.log('decimals:', decimals)

    const rate = parseInt(crowdsalePageStore.rate, 10) //it is from contract. It is already in wei. How much 1 token costs in wei.
    console.log('rate:', rate)

    const tokensToInvest = parseFloat(investStore.tokensToInvest)
    console.log('tokensToInvest:', tokensToInvest)

    const weiToSend = parseInt(tokensToInvest * rate, 10)
    console.log('weiToSend:', weiToSend)

    const opts = {
      from: account,
      value: weiToSend,
      gasPrice: generalStore.gasPrice
    }
    console.log(opts)

    let paramsToExec = [account, weiToSend]
    const method = methodToExec("buy(bytes)", "crowdsaleBuyTokens", this.getBuyParams, paramsToExec)

    method.estimateGas(opts)
      .then(estimatedGas => {
        console.log("estimatedGas:",estimatedGas)
        opts.gasLimit = calculateGasLimit(estimatedGas)
        return sendTXToContract(method.send(opts))
      })
      .then(() => successfulInvestmentAlert(investStore.tokensToInvest))
      .catch(err => toast.showToaster({ type: TOAST.TYPE.ERROR, message: TOAST.MESSAGE.TRANSACTION_FAILED }))
      .then(() => this.setState({ loading: false }))
      .catch((err) => console.log)

    /*initCrowdsaleContract.methods.buy().estimateGas(opts)
      .then(estimatedGas => {
        const estimatedGasMax = 4016260
        opts.gasLimit = !estimatedGas || estimatedGas > estimatedGasMax ? estimatedGasMax : estimatedGas + 100000

        return sendTXToContract(initCrowdsaleContract.methods.buy().send(opts))
      })
      .then(() => successfulInvestmentAlert(investStore.tokensToInvest))
      .catch(err => toast.showToaster({ type: TOAST.TYPE.ERROR, message: TOAST.MESSAGE.TRANSACTION_FAILED }))
      .then(() => this.setState({ loading: false }))*/
  }

  txMinedCallback(txHash, receipt) {
    const { investStore } = this.props

    if (receipt) {
      if (receipt.blockNumber) {
        this.setState({ loading: false })
        successfulInvestmentAlert(investStore.tokensToInvest)
      }
    } else {
      setTimeout(() => {
        checkTxMined(txHash, receipt => this.txMinedCallback(txHash, receipt))
      }, 500)
    }
  }

  tokensToInvestOnChange = event => {
    this.setState({ pristineTokenInput: false })
    this.props.investStore.setProperty('tokensToInvest', event.target.value)
  }

  isValidToken(token) {
    return +token > 0 && countDecimalPlaces(token) <= this.props.tokenStore.decimals
  }

  render () {
    const { crowdsalePageStore, tokenStore, contractStore, investStore } = this.props
    const { tokenAmountOf } = crowdsalePageStore
    const { crowdsale } = contractStore
    const { tokensToInvest } = investStore

    const { curAddr, pristineTokenInput, investThrough, crowdsaleExecID, web3Available, toNextTick, nextTick } = this.state
    const { days, hours, minutes, seconds } = toNextTick

    const { decimals, ticker, name } = tokenStore

    const tokenDecimals = !isNaN(decimals) ? decimals : 0
    const tokenTicker = ticker ? ticker.toString() : ''
    const tokenName = name ? name.toString() : ''
    const maximumSellableTokens = toBigNumber(crowdsalePageStore.maximumSellableTokens)
    const maxCapBeforeDecimals = toBigNumber(maximumSellableTokens).div(`1e${tokenDecimals}`)
    //const tokenAddress = getContractStoreProperty('token', 'addr')

    //balance
    const investorBalanceTiers = tokenAmountOf ? (tokenAmountOf / 10 ** tokenDecimals).toString() : '0'
    const investorBalance = investorBalanceTiers

    //total supply
    const totalSupply = maxCapBeforeDecimals.toFixed()

    let invalidTokenDescription = null
    if (!pristineTokenInput && !this.isValidToken(tokensToInvest)) {
      invalidTokenDescription = (
        <p className="error">
          Number of tokens to buy should be positive and should not exceed {decimals} decimals.
        </p>
      )
    }

    const QRPaymentProcessElement = investThrough === INVESTMENT_OPTIONS.QR ?
      <QRPaymentProcess crowdsaleExecID={crowdsaleExecID} /> :
      null

    const ContributeButton = investThrough === INVESTMENT_OPTIONS.METAMASK ?
      <a className="button button_fill" onClick={this.investToTokens}>Contribute</a> :
      null

    const rightColumnClasses = classNames('invest-table-cell', 'invest-table-cell_right', {
      'qr-selected': investThrough === INVESTMENT_OPTIONS.QR
    })

    return <div className="invest container">
      <div className="invest-table">
        <div className="invest-table-cell invest-table-cell_left">
          <CountdownTimer
            displaySeconds={this.state.displaySeconds}
            nextTick={nextTick}
            tiersLength={crowdsalePageStore && crowdsalePageStore.tiers.length}
            days={days}
            hours={hours}
            minutes={minutes}
            seconds={seconds}
            msToNextTick={this.state.msToNextTick}
            onComplete={this.resetTimers}
            isFinalized={this.state.isFinalized}
          />
          <div className="hashes">
            <div className="hashes-i">
              <p className="hashes-title">{curAddr}</p>
              <p className="hashes-description">Current Account</p>
            </div>
            {/*<div className="hashes-i">
              <p className="hashes-title">{tokenAddress}</p>
              <p className="hashes-description">Token Address</p>
            </div>*/}
            <div className="hashes-i">
              <p className="hashes-title">{crowdsale && crowdsale.execID}</p>
              <p className="hashes-description">Crowdsale Execution ID</p>
            </div>
            <div className="hashes-i">
              <p className="hashes-title">{tokenName}</p>
              <p className="hashes-description">Name</p>
            </div>
            <div className="hashes-i">
              <p className="hashes-title">{tokenTicker}</p>
              <p className="hashes-description">Ticker</p>
            </div>
            <div className="hashes-i">
              <p className="hashes-title">{totalSupply} {tokenTicker}</p>
              <p className="hashes-description">Total Supply</p>
            </div>
          </div>
          <p className="invest-title">Invest page</p>
          <p className="invest-description">
            {'Here you can invest in the crowdsale campaign. At the moment, you need Metamask client to invest into the crowdsale.'}
            {/*{'Here you can invest in the crowdsale campaign. At the moment, you need Metamask client to invest into the crowdsale. If you don\'t have Metamask, you can send ethers to the crowdsale address with a MethodID: 0xa6f2ae3a. Sample '}*/}
            {/*<a href="https://kovan.etherscan.io/tx/0x42073576a160206e61b4d9b70b436359b8d220f8b88c7c272c77023513c62c3d">transaction</a> on Kovan network.*/}
          </p>
        </div>
        <div className={rightColumnClasses}>
          <div className="balance">
            <p className="balance-title">{investorBalance} {tokenTicker}</p>
            <p className="balance-description">Balance</p>
            <p className="description">
              Your balance in tokens.
            </p>
          </div>
          <form className="invest-form" onSubmit={this.investToTokens}>
            <label className="invest-form-label">Choose amount to invest</label>
            <div className="invest-form-input-container">
              <input type="text" className="invest-form-input" value={tokensToInvest} onChange={this.tokensToInvestOnChange} placeholder="0"/>
              <div className="invest-form-label">TOKENS</div>
              {invalidTokenDescription}
            </div>
            <div className="invest-through-container">
              <select value={investThrough} className="invest-through" onChange={(e) => this.setState({ investThrough: e.target.value })}>
                <option disabled={!web3Available} value={INVESTMENT_OPTIONS.METAMASK}>Metamask {!web3Available ? ' (not available)' : null}</option>
                <option value={INVESTMENT_OPTIONS.QR}>QR</option>
              </select>
              { ContributeButton }
            </div>
            <p className="description">
              Think twice before contributing to Crowdsales. Tokens will be deposited on a wallet you used to buy tokens.
            </p>
          </form>
          { QRPaymentProcessElement }
        </div>
      </div>
      <Loader show={this.state.loading}></Loader>
    </div>
  }
}
